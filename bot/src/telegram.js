/**
 * Telegram sender cho bot — port từ crm/lib/notify/telegram.ts.
 * Dùng cho system alerts: gửi QR code khi cần re-auth, gửi alert khi disconnect.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { prisma } from './db.js';
import { getSetting } from './settings.js';
import { logger } from './logger.js';

const TG_API = 'https://api.telegram.org';

async function getToken() {
  return await getSetting('telegram.bot_token');
}

/**
 * Gửi text message tới Telegram chat.
 * @returns {Promise<{ok: boolean, errorMsg?: string}>}
 */
export async function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
  const token = await getToken();
  if (!token) {
    return { ok: false, errorMsg: 'TELEGRAM_BOT_TOKEN chưa cấu hình' };
  }
  try {
    const resp = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      return { ok: false, errorMsg: data.description || `HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errorMsg: e.message };
  }
}

/**
 * Gửi photo (PNG path) tới Telegram chat với caption.
 * Dùng multipart/form-data để upload file.
 */
export async function sendTelegramPhoto(chatId, photoPath, caption = '', parseMode = 'Markdown') {
  const token = await getToken();
  if (!token) {
    return { ok: false, errorMsg: 'TELEGRAM_BOT_TOKEN chưa cấu hình' };
  }
  try {
    const buffer = readFileSync(photoPath);
    const blob = new Blob([buffer], { type: 'image/png' });

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', blob, basename(photoPath));
    if (caption) {
      form.append('caption', caption);
      form.append('parse_mode', parseMode);
    }

    const resp = await fetch(`${TG_API}/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      return { ok: false, errorMsg: data.description || `HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, errorMsg: e.message };
  }
}

/**
 * Lấy danh sách chat_id admin (telegram recipients đang active + nhận alert).
 * Dùng cho system alerts (QR re-scan, disconnect notification).
 * @returns {Promise<string[]>}
 */
export async function getAdminChatIds() {
  try {
    const recipients = await prisma.notificationRecipient.findMany({
      where: {
        channel: 'telegram',
        isActive: true,
        alertReject: true,
      },
      select: { address: true },
    });
    return recipients.map((r) => r.address);
  } catch (e) {
    logger.warn({ err: e.message }, 'getAdminChatIds failed');
    return [];
  }
}

/**
 * Broadcast 1 message tới tất cả admin chats. Log result, không throw.
 */
export async function notifyAdmins(text, parseMode = 'Markdown') {
  const chats = await getAdminChatIds();
  if (chats.length === 0) {
    logger.warn('notifyAdmins: không có telegram recipient nào active');
    return;
  }
  for (const chatId of chats) {
    const r = await sendTelegramMessage(chatId, text, parseMode);
    if (!r.ok) {
      logger.warn({ chatId, err: r.errorMsg }, 'notifyAdmins: gửi fail');
    }
  }
}

/**
 * Broadcast 1 photo tới tất cả admin chats. Log result, không throw.
 */
export async function notifyAdminsPhoto(photoPath, caption = '', parseMode = 'Markdown') {
  const chats = await getAdminChatIds();
  if (chats.length === 0) {
    logger.warn('notifyAdminsPhoto: không có telegram recipient nào active');
    return;
  }
  for (const chatId of chats) {
    const r = await sendTelegramPhoto(chatId, photoPath, caption, parseMode);
    if (!r.ok) {
      logger.warn({ chatId, err: r.errorMsg }, 'notifyAdminsPhoto: gửi fail');
    }
  }
}
