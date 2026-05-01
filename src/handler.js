/**
 * Handler chính: nhận message từ WhatsApp, parse caption, gọi vision AI,
 * lưu submission, sinh tin nhắn phản hồi.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
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
    const existing = findSubmissionByMessageId(waMessageId);
    if (existing) {
      logger.info({ waMessageId }, 'Duplicate message, skipping');
      return {
        reply: 'Tin nhắn đã được xử lý trước đó.',
        submission: existing,
      };
    }
  }

  const leader = getOrCreateTeamLeader(waSenderNumber, waSenderName);

  const parsed = parseCaption(caption || '');
  if (parsed.error) {
    const sub = insertSubmission({
      team_leader_id: leader.id,
      campaign_id: null,
      submission_type: 'campaign_start',
      image_path: imagePath,
      caption,
      gps_latitude: gpsLatitude,
      gps_longitude: gpsLongitude,
      gps_address: gpsAddress,
      evaluation_result: 'needs_review',
      ai_feedback: parsed.error,
      wa_message_id: waMessageId,
      wa_chat_id: waChatId,
      wa_sender_number: waSenderNumber,
      wa_sender_name: waSenderName,
    });
    return { reply: parsed.error, submission: sub };
  }

  const campaign = findActiveCampaignByCode(parsed.code);
  if (!campaign) {
    const msg = `Không tìm thấy campaign mã *${parsed.code}* đang hoạt động. Liên hệ admin để xác nhận.`;
    const sub = insertSubmission({
      team_leader_id: leader.id,
      campaign_id: null,
      submission_type: parsed.type,
      image_path: imagePath,
      caption,
      gps_latitude: gpsLatitude,
      gps_longitude: gpsLongitude,
      gps_address: gpsAddress,
      evaluation_result: 'needs_review',
      ai_feedback: msg,
      reported_subscribers: parsed.subs ?? null,
      wa_message_id: waMessageId,
      wa_chat_id: waChatId,
      wa_sender_number: waSenderNumber,
      wa_sender_name: waSenderName,
    });
    return { reply: msg, submission: sub };
  }

  if (
    !campaign.template_image_path ||
    !existsSync(campaign.template_image_path)
  ) {
    const msg = `Campaign *${campaign.code}* chưa có ảnh template. Liên hệ admin upload template trước.`;
    const sub = insertSubmission({
      team_leader_id: leader.id,
      campaign_id: campaign.id,
      submission_type: parsed.type,
      image_path: imagePath,
      caption,
      gps_latitude: gpsLatitude,
      gps_longitude: gpsLongitude,
      gps_address: gpsAddress,
      evaluation_result: 'needs_review',
      ai_feedback: msg,
      reported_subscribers: parsed.subs ?? null,
      wa_message_id: waMessageId,
      wa_chat_id: waChatId,
      wa_sender_number: waSenderNumber,
      wa_sender_name: waSenderName,
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
        templateImagePath: campaign.template_image_path,
        campaignName: campaign.name,
        campaignRequirements: campaign.template_requirements,
      });
      userMessage = formatStartReply(campaign, evaluation);
    } else {
      const r = await evaluateEndOfDayReport({
        endImagePath: imagePath,
        templateImagePath: campaign.template_image_path,
        campaignName: campaign.name,
        reportedSubscribers: parsed.subs,
        targetSubscribers: campaign.target_subscribers,
      });
      evaluation = r.evaluation;
      userMessage = r.summary + '\n\n' + (evaluation.feedback_for_user || '');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'OpenAI vision call failed');
    const msg = `Lỗi đánh giá AI: ${err.message}. Sẽ thử lại.`;
    const sub = insertSubmission({
      team_leader_id: leader.id,
      campaign_id: campaign.id,
      submission_type: parsed.type,
      image_path: imagePath,
      caption,
      gps_latitude: gpsLatitude,
      gps_longitude: gpsLongitude,
      gps_address: gpsAddress,
      evaluation_result: 'needs_review',
      ai_feedback: msg,
      reported_subscribers: parsed.subs ?? null,
      wa_message_id: waMessageId,
      wa_chat_id: waChatId,
      wa_sender_number: waSenderNumber,
      wa_sender_name: waSenderName,
    });
    return { reply: msg, submission: sub };
  }

  const result = evaluation.meets_standard ? 'approved' : 'rejected';
  const sub = insertSubmission({
    team_leader_id: leader.id,
    campaign_id: campaign.id,
    submission_type: parsed.type,
    image_path: imagePath,
    caption,
    gps_latitude: gpsLatitude,
    gps_longitude: gpsLongitude,
    gps_address: gpsAddress,
    evaluation_result: result,
    similarity_score: evaluation.similarity_score,
    meets_standard: evaluation.meets_standard ? 1 : 0,
    ai_feedback: evaluation.feedback_for_user,
    ai_raw_response: JSON.stringify(evaluation),
    reported_subscribers: parsed.subs ?? null,
    wa_message_id: waMessageId,
    wa_chat_id: waChatId,
    wa_sender_number: waSenderNumber,
    wa_sender_name: waSenderName,
  });

  if (parsed.type === 'campaign_end') {
    const startSub = findTodayStartSubmission(campaign.id);
    upsertDailyReport({
      campaignId: campaign.id,
      reportDate: new Date().toISOString().slice(0, 10),
      actualSubscribers: parsed.subs,
      targetSubscribers: campaign.target_subscribers,
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
      `Mục tiêu hôm nay: ${campaign.target_subscribers} thuê bao. ¡Éxito!`
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
 * Trả lời cho text-only message (HELP, STATUS, ...).
 * @returns {string|null} null nếu không cần trả lời
 */
export function handleTextMessage(text, db) {
  const t = (text || '').trim().toUpperCase();
  if (!t) return null;
  if (t === 'HELP' || t === '?' || t === '/HELP') return HELP_TEXT;
  if (t === 'STATUS') {
    const rows = db
      .prepare(
        "SELECT code, name, target_subscribers FROM campaigns WHERE is_active = 1 LIMIT 10",
      )
      .all();
    if (rows.length === 0) return 'Hiện chưa có campaign nào đang hoạt động.';
    const lines = ['📊 *Campaign đang hoạt động:*', ''];
    for (const c of rows) {
      lines.push(`• ${c.code} — ${c.name} (target ${c.target_subscribers}/ngày)`);
    }
    return lines.join('\n');
  }
  return null; // không phản hồi tin nhắn text khác để tránh ồn group
}
