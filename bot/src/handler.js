/**
 * Handler chính: nhận message từ WhatsApp, parse caption, gọi vision AI,
 * lưu submission, sinh tin nhắn phản hồi.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { config } from './config.js';
import { logger } from './logger.js';
import {
  getOrCreateTeamLeader,
  findActiveCampaignByCode,
  insertSubmission,
  findSubmissionByMessageId,
  findTodayStartSubmission,
  upsertDailyReport,
  listActiveCampaigns,
} from './db.js';
import {
  evaluateSubmissionImage,
  evaluateEndOfDayReport,
} from './vision.js';
import { getSetting } from './settings.js';
import {
  imageHash,
  getCachedEvaluation,
  setCachedEvaluation,
  isThrottled,
  recordMetric,
} from './cache.js';
import { checkImageQuality } from './image-quality.js';
import { prisma } from './db.js';
import { notifyAdmins } from './telegram.js';
import { ES } from './i18n-es.js';

// Phase D.3: Haversine distance km giữa 2 GPS points
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Phase B: Multi-image grouping per sender (30s window).
// Khi promotor gửi nhiều ảnh liên tiếp KHÔNG có caption → attach vào active submission.
const MULTI_IMAGE_WINDOW_MS = 30_000;
const activeSubmissions = new Map(); // senderNumber → { submissionId, expiresAt }

function getActiveSubmissionFor(sender) {
  const v = activeSubmissions.get(sender);
  if (!v) return null;
  if (Date.now() > v.expiresAt) {
    activeSubmissions.delete(sender);
    return null;
  }
  return v.submissionId;
}

function markActiveSubmission(sender, submissionId) {
  activeSubmissions.set(sender, {
    submissionId,
    expiresAt: Date.now() + MULTI_IMAGE_WINDOW_MS,
  });
}

// Cleanup expired entries
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of activeSubmissions) {
    if (v.expiresAt < now) activeSubmissions.delete(k);
  }
}, 60_000).unref();

// Default keywords (fallback nếu campaign không cấu hình riêng)
const DEFAULT_START_KEYWORDS = ['CAMPAIGN'];
const DEFAULT_END_KEYWORDS = ['END'];

// Detection regex chỉ dùng cho text-without-image hint (handleTextMessage)
// — không dùng cho parseCaption vì keywords giờ động per-campaign.
const HINT_RE = /\b(CAMPAIGN|END|INICIO|FIN|BẮT ĐẦU|CIERRE)\b/i;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getKeywords(jsonStr, fallback) {
  if (!jsonStr) return fallback;
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr) || arr.length === 0) return fallback;
    const cleaned = arr
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0 && s.length <= 30);
    return cleaned.length > 0 ? cleaned : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Parse caption matching active campaigns + their dynamic keywords.
 * @param {string} caption
 * @returns {Promise<{type:'campaign_start'|'campaign_end', code:string, subs?:number} | {error:string}>}
 */
export async function parseCaption(caption) {
  if (!caption || !caption.trim()) {
    return {
      error: ES.EMPTY_CAPTION,
    };
  }

  const upper = caption.trim().toUpperCase();
  const campaigns = await listActiveCampaigns(100);

  for (const c of campaigns) {
    const code = c.code.toUpperCase();
    const codeEsc = escapeRegex(code);
    const startKeys = getKeywords(c.startKeywords, DEFAULT_START_KEYWORDS);
    const endKeys = getKeywords(c.endKeywords, DEFAULT_END_KEYWORDS);

    // Match END trước (vì END thường chứa từ start như "campaign_end")
    // u flag: word boundary nhận đúng Unicode chars (vd code "CAMPAÑA")
    for (const kw of endKeys) {
      const re = new RegExp(
        `\\b${escapeRegex(kw.toUpperCase())}\\s+${codeEsc}\\b.*?SUBS\\s*=\\s*(\\d+)`,
        'isu',
      );
      const m = upper.match(re);
      if (m) {
        return { type: 'campaign_end', code, subs: parseInt(m[1], 10) };
      }
    }

    // Match START
    for (const kw of startKeys) {
      const re = new RegExp(
        `\\b${escapeRegex(kw.toUpperCase())}\\s+${codeEsc}\\b`,
        'iu',
      );
      if (re.test(upper)) {
        return { type: 'campaign_start', code };
      }
    }
  }

  return {
    error: ES.PARSE_ERROR,
  };
}

/**
 * Build HELP message dynamic — list active campaigns + keywords.
 */
async function buildHelpText() {
  const campaigns = await listActiveCampaigns(20);
  const lines = [ES.HELP_HEADER];

  if (campaigns.length === 0) {
    lines.push(ES.HELP_NO_CAMPAIGNS);
  } else {
    lines.push(ES.HELP_CAMPAIGNS_LABEL);
    for (const c of campaigns) {
      const startKeys = getKeywords(c.startKeywords, DEFAULT_START_KEYWORDS).join(' / ');
      const endKeys = getKeywords(c.endKeywords, DEFAULT_END_KEYWORDS).join(' / ');
      lines.push(`• \`${c.code}\` — ${c.name}`);
      lines.push(`  ${ES.HELP_START}: \`${startKeys} ${c.code}\``);
      lines.push(`  ${ES.HELP_END}: \`${endKeys} ${c.code} SUBS=<número>\``);
      lines.push('');
    }
  }

  lines.push(ES.HELP_FOOTER_NOTE);
  lines.push(ES.HELP_FOOTER_STATUS);
  return lines.join('\n');
}

/**
 * Lưu media buffer xuống đĩa, trả về absolute path.
 */
export function saveMediaBuffer(buffer, mimetype = 'image/jpeg') {
  const extMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  const ext = extMap[mimetype] || '.jpg';
  const filename = `${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
  const filepath = join(config.uploadDir, filename);
  writeFileSync(filepath, buffer);
  return filepath;
}

/**
 * Pick GPS từ vision OCR (priority) → fallback WA location pairing.
 * Validate coords trong range hợp lệ, build gpsAddress từ metadata.
 * @returns {{lat: number|null, lng: number|null, address: string|null}}
 */
function pickGps({ visionGps, fallbackLat, fallbackLng, fallbackAddress }) {
  // Vision OCR result
  if (
    visionGps &&
    typeof visionGps.latitude === 'number' &&
    typeof visionGps.longitude === 'number' &&
    visionGps.latitude >= -90 &&
    visionGps.latitude <= 90 &&
    visionGps.longitude >= -180 &&
    visionGps.longitude <= 180
  ) {
    const meta = [];
    if (visionGps.elevation_m != null) meta.push(`elev ${visionGps.elevation_m}m`);
    if (visionGps.accuracy_m != null) meta.push(`±${visionGps.accuracy_m}m`);
    if (visionGps.captured_at) meta.push(visionGps.captured_at);
    if (visionGps.note) meta.push(`note: ${visionGps.note}`);
    return {
      lat: visionGps.latitude,
      lng: visionGps.longitude,
      address: meta.length > 0 ? meta.join(' | ') : null,
    };
  }
  // Fallback (WA location pairing)
  if (typeof fallbackLat === 'number' && typeof fallbackLng === 'number') {
    return { lat: fallbackLat, lng: fallbackLng, address: fallbackAddress ?? 'WA location pin' };
  }
  return { lat: null, lng: null, address: null };
}

/**
 * Build base submission payload (fields chung cho mọi loại submission).
 */
function buildBaseSubmission({
  leaderId,
  campaignId,
  submissionType,
  imagePath,
  caption,
  gpsLatitude,
  gpsLongitude,
  gpsAddress,
  waMessageId,
  waChatId,
  waSenderNumber,
  waSenderName,
  reportedSubscribers,
}) {
  return {
    teamLeaderId: leaderId ?? null,
    campaignId: campaignId ?? null,
    submissionType,
    imagePath,
    caption: caption ?? null,
    gpsLatitude: gpsLatitude ?? null,
    gpsLongitude: gpsLongitude ?? null,
    gpsAddress: gpsAddress ?? null,
    waMessageId: waMessageId ?? null,
    waChatId: waChatId ?? null,
    waSenderNumber: waSenderNumber ?? null,
    waSenderName: waSenderName ?? null,
    reportedSubscribers: reportedSubscribers ?? null,
  };
}

/**
 * Xử lý ảnh + caption từ WhatsApp.
 * @returns {Promise<{reply: string, submission?: object}>}
 */
export async function handleImageSubmission({
  waMessageId,
  waChatId,
  waSenderNumber,
  waSenderName,
  imagePath,
  caption,
  gpsLatitude = null,
  gpsLongitude = null,
  gpsAddress = null,
}) {
  // Idempotency
  if (waMessageId) {
    const existing = await findSubmissionByMessageId(waMessageId);
    if (existing) {
      logger.info({ waMessageId }, 'Duplicate message, skipping');
      return {
        reply: ES.DUPLICATE_PROCESSED,
        submission: existing,
      };
    }
  }

  // Phase B.2: Image quality pre-check trước khi tốn API
  const quality = checkImageQuality(imagePath);
  if (!quality.ok) {
    const leader2 = await getOrCreateTeamLeader(waSenderNumber, waSenderName);
    logger.warn({ reason: quality.reason, imagePath }, 'Image quality pre-check failed');
    const sub = await insertSubmission({
      ...buildBaseSubmission({
        leaderId: leader2.id,
        campaignId: null,
        submissionType: 'campaign_start',
        imagePath,
        caption,
        gpsLatitude,
        gpsLongitude,
        gpsAddress,
        waMessageId,
        waChatId,
        waSenderNumber,
        waSenderName,
      }),
      evaluationResult: 'needs_review',
      aiFeedback: ES.QUALITY_FAIL_FEEDBACK(quality.reason),
      qualityFailed: true,
      qualityFailReason: quality.reason,
    });
    return {
      reply: ES.QUALITY_FAIL_REPLY(quality.reason),
      submission: sub,
    };
  }

  // Phase B.1: Multi-image grouping — nếu sender vừa gửi submission có caption trong 30s
  // và ảnh hiện tại KHÔNG có caption → attach làm ảnh phụ thay vì tạo submission mới
  if (waSenderNumber && (!caption || !caption.trim())) {
    const activeId = getActiveSubmissionFor(waSenderNumber);
    if (activeId) {
      try {
        const order = await prisma.submissionImage.count({ where: { submissionId: activeId } });
        const hash = imageHash(imagePath);
        await prisma.submissionImage.create({
          data: {
            submissionId: activeId,
            imagePath,
            imageOrder: order + 1,
            imageHash: hash,
          },
        });
        logger.info({ activeId, order: order + 1, sender: waSenderNumber }, 'Attached additional image to active submission');
        // Refresh window
        markActiveSubmission(waSenderNumber, activeId);
        return {
          reply: ES.MULTI_IMAGE_ATTACHED(order + 1, activeId),
          submission: { id: activeId },
        };
      } catch (err) {
        logger.warn({ err: err.message }, 'Multi-image attach failed — fallback to new submission');
      }
    }
  }

  const leader = await getOrCreateTeamLeader(waSenderNumber, waSenderName);

  const parsed = await parseCaption(caption || '');
  if (parsed.error) {
    const sub = await insertSubmission({
      ...buildBaseSubmission({
        leaderId: leader.id,
        campaignId: null,
        submissionType: 'campaign_start',
        imagePath,
        caption,
        gpsLatitude,
        gpsLongitude,
        gpsAddress,
        waMessageId,
        waChatId,
        waSenderNumber,
        waSenderName,
      }),
      evaluationResult: 'needs_review',
      aiFeedback: parsed.error,
    });
    return { reply: parsed.error, submission: sub };
  }

  const campaign = await findActiveCampaignByCode(parsed.code);
  if (!campaign) {
    const msg = ES.CAMPAIGN_NOT_FOUND(parsed.code);
    const sub = await insertSubmission({
      ...buildBaseSubmission({
        leaderId: leader.id,
        campaignId: null,
        submissionType: parsed.type,
        imagePath,
        caption,
        gpsLatitude,
        gpsLongitude,
        gpsAddress,
        waMessageId,
        waChatId,
        waSenderNumber,
        waSenderName,
        reportedSubscribers: parsed.subs ?? null,
      }),
      evaluationResult: 'needs_review',
      aiFeedback: msg,
    });
    return { reply: msg, submission: sub };
  }

  // Throttle: cùng sender + cùng campaign trong 5s → reject (anti accidental double-tap)
  const throttleEnabled = (await getSetting('submission.throttle_enabled', '0')) === '1';
  if (throttleEnabled && waSenderNumber && (await isThrottled({ senderNumber: waSenderNumber, campaignId: campaign.id }))) {
    const msg = ES.THROTTLED(campaign.code);
    logger.info({ sender: waSenderNumber, campaign: campaign.code }, 'Throttled duplicate submission');
    recordMetric('throttled');
    return { reply: msg, submission: null };
  }

  if (
    !campaign.templateImagePath ||
    !existsSync(campaign.templateImagePath)
  ) {
    const msg = ES.NO_TEMPLATE(campaign.code);
    const sub = await insertSubmission({
      ...buildBaseSubmission({
        leaderId: leader.id,
        campaignId: campaign.id,
        submissionType: parsed.type,
        imagePath,
        caption,
        gpsLatitude,
        gpsLongitude,
        gpsAddress,
        waMessageId,
        waChatId,
        waSenderNumber,
        waSenderName,
        reportedSubscribers: parsed.subs ?? null,
      }),
      evaluationResult: 'needs_review',
      aiFeedback: msg,
    });
    return { reply: msg, submission: sub };
  }

  // Vision cache lookup (cùng image hash + cùng campaign + cùng detection mode)
  const cacheEnabled = (await getSetting('vision.cache_enabled', '0')) === '1';
  const detectionMode = (await getSetting('vision.detection_mode_enabled', '0')) === '1';
  const hash = imageHash(imagePath);
  let cachedEval = null;
  if (cacheEnabled) {
    cachedEval = await getCachedEvaluation({
      imageHash: hash,
      campaignId: campaign.id,
      detectionMode,
    });
    if (cachedEval) {
      logger.info({ hash: hash.slice(0, 12), campaign: campaign.code }, 'Vision cache HIT — skip API call');
      recordMetric('cache_hit');

      // Phase D.2: Duplicate image alert — nếu cache row đã có lastHitAt > 24h trước
      try {
        const cacheRow = await prisma.visionCache.findUnique({
          where: {
            uq_vision_cache: {
              imageHash: hash,
              campaignId: campaign.id,
              detectionMode,
            },
          },
          select: { createdAt: true, hits: true },
        });
        if (cacheRow) {
          const ageH = (Date.now() - cacheRow.createdAt.getTime()) / 3600_000;
          if (ageH > 24) {
            notifyAdmins(
              `♻️ *Duplicate image detected*\n\n` +
                `Promotor *${waSenderName || waSenderNumber}* gửi lại ảnh đã submit cho campaign *${campaign.code}* cách đây ${Math.floor(ageH)}h.\n` +
                `Image hash: \`${hash.slice(0, 16)}...\`\n` +
                `Hits: ${cacheRow.hits + 1}\n` +
                `→ Có thể fake submit. Review thủ công.`,
            ).catch((e) => logger.warn({ err: e.message }, 'duplicate alert failed'));
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'duplicate check failed');
      }
    } else {
      recordMetric('cache_miss');
    }
  }

  // Gọi OpenAI vision (hoặc dùng cache)
  let evaluation;
  let userMessage;
  try {
    if (parsed.type === 'campaign_start') {
      evaluation = cachedEval || await evaluateSubmissionImage({
        submissionImagePath: imagePath,
        templateImagePath: campaign.templateImagePath,
        campaignName: campaign.name,
        campaignRequirements: campaign.templateRequirements,
        requirementsJson: campaign.requirementsJson,
      });
      userMessage = formatStartReply(campaign, evaluation);
    } else {
      let endResult;
      if (cachedEval) {
        // Cached evaluation + tự build summary với reportedSubs (vì summary phụ thuộc subs)
        evaluation = cachedEval;
        const achieved = parsed.subs >= campaign.targetSubscribers;
        const pct = campaign.targetSubscribers ? (parsed.subs / campaign.targetSubscribers) * 100 : 0;
        const status = achieved && evaluation.meets_standard
          ? ES.STATUS_BOTH_OK
          : achieved
            ? ES.STATUS_SUBS_OK_IMG_NO
            : evaluation.meets_standard
              ? ES.STATUS_IMG_OK_SUBS_NO
              : ES.STATUS_NEITHER;
        userMessage = ES.END_SUMMARY_TEMPLATE(
          campaign.code,
          parsed.subs,
          campaign.targetSubscribers,
          pct.toFixed(0),
          evaluation.similarity_score,
          status,
          evaluation.feedback_for_user || '',
        );
      } else {
        endResult = await evaluateEndOfDayReport({
          endImagePath: imagePath,
          templateImagePath: campaign.templateImagePath,
          campaignName: campaign.name,
          campaignRequirements: campaign.templateRequirements,
          requirementsJson: campaign.requirementsJson,
          reportedSubscribers: parsed.subs,
          targetSubscribers: campaign.targetSubscribers,
        });
        evaluation = endResult.evaluation;
        userMessage = endResult.summary + '\n\n' + (evaluation.feedback_for_user || '');
      }
    }
    // Save vision result vào cache (chỉ khi cache enabled + không phải cached miss)
    if (cacheEnabled && !cachedEval) {
      await setCachedEvaluation({
        imageHash: hash,
        campaignId: campaign.id,
        detectionMode,
        evaluation,
      });
    }
  } catch (err) {
    logger.error({ err: err.message }, 'OpenAI vision call failed');
    const msg = ES.AI_ERROR(err.message);
    const sub = await insertSubmission({
      ...buildBaseSubmission({
        leaderId: leader.id,
        campaignId: campaign.id,
        submissionType: parsed.type,
        imagePath,
        caption,
        gpsLatitude,
        gpsLongitude,
        gpsAddress,
        waMessageId,
        waChatId,
        waSenderNumber,
        waSenderName,
        reportedSubscribers: parsed.subs ?? null,
      }),
      evaluationResult: 'needs_review',
      aiFeedback: msg,
    });
    return { reply: msg, submission: sub };
  }

  // Phase B.5: AI confidence low → route sang needs_review thay vì approved/rejected
  // Detection mode trả về _detections với confidence per item. Nếu BẤT KỲ required item
  // có confidence='low' → admin cần review manually.
  let evaluationResult = evaluation.meets_standard ? 'approved' : 'rejected';
  if (evaluation._detections && Array.isArray(evaluation._detections)) {
    const hasLowConfidence = evaluation._detections.some((d) => d.confidence === 'low');
    if (hasLowConfidence) {
      evaluationResult = 'needs_review';
      logger.info({ submissionId: 'pending', detections: evaluation._detections.filter(d => d.confidence === 'low').map(d => d.label) }, 'Routed to needs_review due to low confidence');
    }
  }

  // GPS: ưu tiên vision OCR (NoteCam stamp) → fallback WA location pairing
  const gps = pickGps({
    visionGps: evaluation.gps,
    fallbackLat: gpsLatitude,
    fallbackLng: gpsLongitude,
    fallbackAddress: gpsAddress,
  });

  // Phase D.3: Fuera-de-zona check — nếu submission GPS xa branch HQ > radius → flag needs_review
  let outOfZone = false;
  let outOfZoneKm = null;
  if (gps.lat != null && gps.lng != null && campaign.branchId) {
    try {
      const branch = await prisma.branch.findUnique({
        where: { id: campaign.branchId },
        select: { gpsLatitude: true, gpsLongitude: true, gpsRadiusKm: true, code: true },
      });
      if (branch && branch.gpsLatitude != null && branch.gpsLongitude != null) {
        const dist = haversineKm(gps.lat, gps.lng, branch.gpsLatitude, branch.gpsLongitude);
        if (dist > branch.gpsRadiusKm) {
          outOfZone = true;
          outOfZoneKm = Math.round(dist * 10) / 10;
          evaluationResult = 'needs_review';
          logger.warn(
            { branch: branch.code, dist: outOfZoneKm, radius: branch.gpsRadiusKm },
            'Submission FUERA-DE-ZONA — routed to needs_review',
          );
          // Append warning vào feedback
          evaluation.feedback_for_user = `${ES.OUT_OF_ZONE(outOfZoneKm, branch.gpsRadiusKm)} ${evaluation.feedback_for_user || ''}`;
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'fuera-de-zona check failed');
    }
  }

  const sub = await insertSubmission({
    ...buildBaseSubmission({
      leaderId: leader.id,
      campaignId: campaign.id,
      submissionType: parsed.type,
      imagePath,
      caption,
      gpsLatitude: gps.lat,
      gpsLongitude: gps.lng,
      gpsAddress: gps.address,
      waMessageId,
      waChatId,
      waSenderNumber,
      waSenderName,
      reportedSubscribers: parsed.subs ?? null,
    }),
    evaluationResult,
    similarityScore: evaluation.similarity_score,
    meetsStandard: evaluation.meets_standard ? 1 : 0,
    aiFeedback: evaluation.feedback_for_user,
    aiRawResponse: JSON.stringify(evaluation),
    visionCached: !!cachedEval,
    outOfZone,
    outOfZoneKm,
  });

  // Phase B.1: Tạo SubmissionImage row cho primary image + mark active để multi-image attach sau
  try {
    await prisma.submissionImage.create({
      data: {
        submissionId: sub.id,
        imagePath,
        imageOrder: 0,
        imageHash: hash,
      },
    });
    if (waSenderNumber) {
      markActiveSubmission(waSenderNumber, sub.id);
    }
  } catch (err) {
    logger.warn({ err: err.message, submissionId: sub.id }, 'Failed to create primary SubmissionImage row');
  }

  if (parsed.type === 'campaign_end') {
    const startSub = await findTodayStartSubmission(campaign.id);
    // ⭐ Local midnight (timezone của OS bot) — không dùng UTC vì user ở Lima (UTC-5)
    // submit lúc 22:00 local sẽ bị tính sang ngày kế tiếp nếu dùng UTC date
    const now = new Date();
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    await upsertDailyReport({
      campaignId: campaign.id,
      reportDate: localMidnight,
      actualSubscribers: parsed.subs,
      targetSubscribers: campaign.targetSubscribers,
      startSubmissionId: startSub?.id ?? null,
      endSubmissionId: sub.id,
    });
  }

  return { reply: userMessage, submission: sub };
}

function formatStartReply(campaign, ev) {
  if (ev.meets_standard) {
    return ES.START_REPLY_OK(
      campaign.name,
      ev.similarity_score,
      ev.feedback_for_user,
      campaign.targetSubscribers,
    );
  }
  const issues = (ev.issues || []).slice(0, 3).map((i) => `• ${i}`).join('\n');
  const firstStartKw = getKeywords(campaign.startKeywords, DEFAULT_START_KEYWORDS)[0];
  return ES.START_REPLY_FAIL(
    campaign.name,
    ev.similarity_score,
    issues,
    ev.feedback_for_user,
    firstStartKw,
    campaign.code,
  );
}

/**
 * Trả lời cho text-only message (HELP, STATUS, hoặc CAMPAIGN/END gõ sai).
 * @returns {Promise<string|null>} null nếu không cần trả lời
 */
export async function handleTextMessage(text) {
  const raw = (text || '').trim();
  const t = raw.toUpperCase();
  if (!t) return null;
  if (t === 'HELP' || t === '?' || t === '/HELP') return await buildHelpText();
  if (t === 'STATUS') {
    const rows = await listActiveCampaigns(10);
    if (rows.length === 0) return ES.STATUS_NO_CAMPAIGNS;
    const lines = [ES.STATUS_HEADER, ''];
    for (const c of rows) {
      lines.push(ES.STATUS_LINE(c.code, c.name, c.targetSubscribers));
    }
    return lines.join('\n');
  }

  // User gõ keyword (CAMPAIGN/END/INICIO/FIN/...) dưới dạng TEXT (không kèm ảnh) → hướng dẫn
  if (HINT_RE.test(raw)) {
    // Pick first keyword từ campaign đầu tiên đang chạy (nếu có) để hint chính xác
    const campaigns = await listActiveCampaigns(1);
    const c = campaigns[0];
    const kwStart = c
      ? getKeywords(c.startKeywords, DEFAULT_START_KEYWORDS)[0]
      : DEFAULT_START_KEYWORDS[0];
    const kwEnd = c
      ? getKeywords(c.endKeywords, DEFAULT_END_KEYWORDS)[0]
      : DEFAULT_END_KEYWORDS[0];
    return ES.TEXT_WITHOUT_IMAGE(kwStart, kwEnd);
  }

  return null;
}
