/**
 * Telegram-based admin commands cho bot.
 * Polling getUpdates → handle 5 commands: /status /restart /logs /qr /help.
 * Auth: chỉ chat_id trong notification_recipients (channel='telegram', is_active=1, alert_reject=1).
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { prisma } from './db.js';
import { getSetting } from './settings.js';
import {
  sendTelegramMessage,
  getAdminChatIds,
} from './telegram.js';
import { getClient } from './wa.js';

const TG_API = 'https://api.telegram.org';

let polling = false;
let lastUpdateId = 0;
const pendingQrConfirm = new Map(); // chat_id → expires_at (ms)
const QR_CONFIRM_WINDOW_MS = 30_000;

const HELP_TEXT =
  '*Available commands*\n' +
  '`/status` — bot info\n' +
  '`/restart` — restart service (systemd auto-revives)\n' +
  '`/logs` — last 20 log lines\n' +
  '`/qr` — force re-auth (destroys WhatsApp session). Type `/qr confirm` to proceed.\n' +
  '`/help` — this message';

async function tgGetUpdates(token, offset, timeout = 25) {
  const url = `${TG_API}/bot${token}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=["message"]`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!data.ok) throw new Error(data.description || `HTTP ${resp.status}`);
  return data.result;
}

async function reply(chatId, text) {
  return sendTelegramMessage(chatId, text);
}

// ───── Command handlers ─────

async function handleHelp(chatId) {
  await reply(chatId, HELP_TEXT);
}

async function handleStatus(chatId) {
  const uptimeSec = Math.floor(process.uptime());
  const uptimeStr = formatUptime(uptimeSec);
  const mem = process.memoryUsage();
  const memMB = (mem.rss / 1024 / 1024).toFixed(0);

  let waState = 'unknown';
  try {
    const client = getClient();
    if (client) {
      const state = await client.getState().catch(() => null);
      waState = state || 'INITIALIZING';
    }
  } catch {
    waState = 'error';
  }

  const detectionEnabled = (await getSetting('vision.detection_mode_enabled', '0')) === '1';

  // DB stats (today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [campaignCount, todaySubs, totalUsers] = await Promise.all([
    prisma.campaign.count({ where: { isActive: true } }),
    prisma.submission.count({ where: { submittedAt: { gte: todayStart } } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  const text =
    '🤖 *Bot Status*\n\n' +
    `⏱  Uptime: \`${uptimeStr}\`\n` +
    `📡 WhatsApp: \`${waState}\`\n` +
    `💾 Memory: \`${memMB} MB\`\n` +
    `🧠 Vision detection mode: \`${detectionEnabled ? 'ON' : 'OFF'}\`\n` +
    `📂 Active campaigns: \`${campaignCount}\`\n` +
    `📥 Submissions today: \`${todaySubs}\`\n` +
    `👤 Active users: \`${totalUsers}\`\n` +
    `🌐 CRM: https://image.bitelbot.com`;

  await reply(chatId, text);
}

async function handleRestart(chatId) {
  await reply(chatId, '🔄 *Restarting bot...*\nsystemd sẽ auto-revive sau ~10s. Gõ `/status` để verify.');
  setTimeout(() => process.exit(0), 1500);
}

async function handleLogs(chatId) {
  return new Promise((resolve) => {
    const proc = spawn('journalctl', [
      '-u', 'telecombig-bot',
      '-n', '20',
      '--no-pager',
      '--output=cat',
    ]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', async (code) => {
      if (code !== 0 && !out) {
        await reply(chatId, `❌ Không đọc được logs: \`${err.trim() || 'exit code ' + code}\``);
        resolve();
        return;
      }
      // Strip QR ASCII art lines (chứa ▄ █) cho gọn
      const cleaned = out
        .split('\n')
        .filter((l) => !/[▄█]/.test(l))
        .slice(-20)
        .join('\n');
      // Telegram limit 4096 chars/message
      const truncated = cleaned.length > 3500 ? '...\n' + cleaned.slice(-3500) : cleaned;
      await reply(chatId, '📋 *Last 20 log lines* (excl. QR ASCII):\n```\n' + truncated + '\n```');
      resolve();
    });
  });
}

async function handleQr(chatId, confirmed) {
  if (!confirmed) {
    pendingQrConfirm.set(chatId, Date.now() + QR_CONFIRM_WINDOW_MS);
    await reply(
      chatId,
      '⚠️ *Force re-auth WhatsApp*\n\n' +
        'Lệnh này sẽ XOÁ session WhatsApp hiện tại. Bot phải scan QR mới.\n' +
        'Reply `/qr confirm` trong 30 giây để xác nhận.',
    );
    return;
  }

  // /qr confirm path
  const expires = pendingQrConfirm.get(chatId);
  if (!expires || expires < Date.now()) {
    pendingQrConfirm.delete(chatId);
    await reply(chatId, '⏰ Đã hết 30s. Gõ `/qr` lần nữa rồi `/qr confirm` trong 30s.');
    return;
  }
  pendingQrConfirm.delete(chatId);

  await reply(
    chatId,
    '🗑 *Đang xoá session + restart...*\nBot sẽ gửi QR mới qua chat này sau ~15-30s.',
  );

  try {
    const sessionPath = join(config.waSessionDir, `session-${config.waSessionName}`);
    await rm(sessionPath, { recursive: true, force: true });
    logger.info({ sessionPath }, 'Session deleted by /qr confirm command');
  } catch (err) {
    logger.warn({ err: err.message }, 'Không xoá được session folder');
  }

  // Exit để systemd restart → bot init lại → emit QR → gửi qua Telegram
  setTimeout(() => process.exit(0), 1500);
}

// ───── Update dispatcher ─────

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  // Auth: chỉ admin chats được dùng commands
  const adminChats = await getAdminChatIds();
  if (!adminChats.includes(chatId)) {
    logger.info({ chatId, text: text.slice(0, 50) }, 'TG command from non-admin (ignored)');
    return;
  }

  logger.info({ chatId, command: text.split(' ')[0] }, 'TG admin command');

  try {
    if (text === '/start' || text === '/help') return await handleHelp(chatId);
    if (text === '/status') return await handleStatus(chatId);
    if (text === '/restart') return await handleRestart(chatId);
    if (text === '/logs') return await handleLogs(chatId);
    if (text === '/qr') return await handleQr(chatId, false);
    if (text === '/qr confirm') return await handleQr(chatId, true);
    // Unknown command
    if (text.startsWith('/')) {
      await reply(chatId, `❓ Lệnh không nhận diện: \`${text}\`\nGõ \`/help\` để xem danh sách.`);
    }
  } catch (err) {
    logger.error({ err: err.message, command: text }, 'TG command handler error');
    await reply(chatId, `❌ Lỗi xử lý: \`${err.message}\``).catch(() => {});
  }
}

// ───── Polling loop ─────

export async function startTelegramAdminPolling() {
  if (polling) return;
  const token = await getSetting('telegram.bot_token');
  if (!token) {
    logger.warn('TG admin polling: chưa có telegram.bot_token, skip');
    return;
  }
  polling = true;
  logger.info('✓ Telegram admin command polling started');

  // Discard backlog: get current update_id offset
  try {
    const initial = await tgGetUpdates(token, 0, 0);
    if (initial.length > 0) {
      lastUpdateId = initial[initial.length - 1].update_id + 1;
      logger.info({ skipped: initial.length }, 'TG polling: skipped backlog');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'TG polling initial offset failed');
  }

  // Loop forever
  while (polling) {
    try {
      const updates = await tgGetUpdates(token, lastUpdateId, 25);
      for (const u of updates) {
        lastUpdateId = u.update_id + 1;
        await handleUpdate(u);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'TG polling error, retry in 5s');
      await sleep(5000);
    }
  }
}

export function stopTelegramAdminPolling() {
  polling = false;
}

// ───── Helpers ─────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
