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

const CAMPAIGN_RE = /CAMPAIGN\s+(\S+)/i;
const END_RE = /END\s+(\S+).*?SUBS\s*=\s*(\d+)/is;

const HELP_TEXT =
  '📋 *Hướng dẫn — Telecom Big Campaign Bot*\n\n' +
  '1️⃣ *Đầu ngày*: gửi ảnh điểm bán + caption:\n' +
  '   `CAMPAIGN <mã_campaign>`\n' +
  '   Ví dụ: CAMPAIGN PROMO_LIMA_001\n\n' +
  '2️⃣ *Cuối ngày*: gửi ảnh + caption:\n' +
  '   `END <mã_campaign> SUBS=<số_thuê_bao>`\n' +
  '   Ví dụ: END PROMO_LIMA_001 SUBS=23\n\n' +
  'AI sẽ đánh giá ảnh và trả lời ngay. Gõ STATUS để xem campaign đang chạy.';

/**
 * @param {string} caption
 * @returns {{type:'campaign_start'|'campaign_end', code:string, subs?:number} | {error:string}}
 */
export function parseCaption(caption) {
  if (!caption || !caption.trim()) {
    return {
      error:
        'Caption trống. Cú pháp:\n  CAMPAIGN <mã>           (đầu ngày)\n  END <mã> SUBS=<số>      (cuối ngày)',
    };
  }
  const endMatch = caption.match(END_RE);
  if (endMatch) {
    return {
      type: 'campaign_end',
      code: endMatch[1].toUpperCase(),
      subs: parseInt(endMatch[2], 10),
    };
  }
  const camMatch = caption.match(CAMPAIGN_RE);
  if (camMatch) {
    return { type: 'campaign_start', code: camMatch[1].toUpperCase() };
  }
  return {
    error:
      'Không nhận diện được cú pháp. Dùng:\n  CAMPAIGN <mã>           (đầu ngày)\n  END <mã> SUBS=<số>      (cuối ngày)',
  };
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
        reply: 'Tin nhắn đã được xử lý trước đó.',
        submission: existing,
      };
    }
  }

  const leader = await getOrCreateTeamLeader(waSenderNumber, waSenderName);

  const parsed = parseCaption(caption || '');
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
    const msg = `Không tìm thấy campaign mã *${parsed.code}* đang hoạt động. Liên hệ admin để xác nhận.`;
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

  if (
    !campaign.templateImagePath ||
    !existsSync(campaign.templateImagePath)
  ) {
    const msg = `Campaign *${campaign.code}* chưa có ảnh template. Liên hệ admin upload template trước.`;
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

  // Gọi OpenAI vision
  let evaluation;
  let userMessage;
  try {
    if (parsed.type === 'campaign_start') {
      evaluation = await evaluateSubmissionImage({
        submissionImagePath: imagePath,
        templateImagePath: campaign.templateImagePath,
        campaignName: campaign.name,
        campaignRequirements: campaign.templateRequirements,
      });
      userMessage = formatStartReply(campaign, evaluation);
    } else {
      const r = await evaluateEndOfDayReport({
        endImagePath: imagePath,
        templateImagePath: campaign.templateImagePath,
        campaignName: campaign.name,
        reportedSubscribers: parsed.subs,
        targetSubscribers: campaign.targetSubscribers,
      });
      evaluation = r.evaluation;
      userMessage = r.summary + '\n\n' + (evaluation.feedback_for_user || '');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'OpenAI vision call failed');
    const msg = `Lỗi đánh giá AI: ${err.message}. Sẽ thử lại.`;
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

  const evaluationResult = evaluation.meets_standard ? 'approved' : 'rejected';
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
    evaluationResult,
    similarityScore: evaluation.similarity_score,
    meetsStandard: evaluation.meets_standard ? 1 : 0,
    aiFeedback: evaluation.feedback_for_user,
    aiRawResponse: JSON.stringify(evaluation),
  });

  if (parsed.type === 'campaign_end') {
    const startSub = await findTodayStartSubmission(campaign.id);
    await upsertDailyReport({
      campaignId: campaign.id,
      reportDate: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00'),
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
    return (
      `✅ Ảnh đầu ngày campaign *${campaign.name}* ĐẠT chuẩn (${ev.similarity_score}/100).\n` +
      `${ev.feedback_for_user}\n\n` +
      `Mục tiêu hôm nay: ${campaign.targetSubscribers} thuê bao. ¡Éxito!`
    );
  }
  const issues = (ev.issues || []).slice(0, 3).map((i) => `• ${i}`).join('\n');
  return (
    `⚠️ Ảnh đầu ngày campaign *${campaign.name}* CHƯA ĐẠT chuẩn (${ev.similarity_score}/100).\n` +
    `Vấn đề:\n${issues || '(không có)'}\n\n` +
    `${ev.feedback_for_user}\n\n` +
    `Vui lòng chỉnh sửa và gửi lại với caption: CAMPAIGN ${campaign.code}`
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
  if (t === 'HELP' || t === '?' || t === '/HELP') return HELP_TEXT;
  if (t === 'STATUS') {
    const rows = await listActiveCampaigns(10);
    if (rows.length === 0) return 'Hiện chưa có campaign nào đang hoạt động.';
    const lines = ['📊 *Campaign đang hoạt động:*', ''];
    for (const c of rows) {
      lines.push(`• ${c.code} — ${c.name} (target ${c.targetSubscribers}/ngày)`);
    }
    return lines.join('\n');
  }

  // User gõ CAMPAIGN/END dưới dạng TEXT (không kèm ảnh) → hướng dẫn
  if (CAMPAIGN_RE.test(raw) || END_RE.test(raw)) {
    return (
      '⚠️ *Thiếu ảnh!*\n\n' +
      'Bạn vừa gõ lệnh CAMPAIGN/END dưới dạng text.\n' +
      'Hệ thống yêu cầu phải *kèm ảnh*:\n\n' +
      '1. Bấm 📎 (đính kèm) → chọn ảnh\n' +
      '2. *Trước khi gửi*, gõ caption ngay dưới ảnh:\n' +
      '   `CAMPAIGN <mã>` (đầu ngày)\n' +
      '   `END <mã> SUBS=<số>` (cuối ngày)\n' +
      '3. Bấm gửi.\n\n' +
      'Caption phải nằm *cùng tin với ảnh*, không phải tin riêng.'
    );
  }

  return null;
}
