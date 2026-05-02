/**
 * whatsapp-web.js client wrapper.
 * - Quản lý phiên (LocalAuth)
 * - Lắng nghe message
 * - Tải media
 * - Trả lời (in group / DM theo config)
 */
import wweb from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = wweb;
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { join } from 'node:path';

import { config } from './config.js';
import { logger } from './logger.js';
import { disconnectDb } from './db.js';
import { notifyAdmins, notifyAdminsPhoto } from './telegram.js';
import {
  handleImageSubmission,
  saveMediaBuffer,
  handleTextMessage,
} from './handler.js';
import { ES } from './i18n-es.js';

let client;
// Track xem QR đã gửi qua Telegram session này chưa — tránh spam (QR refresh mỗi ~60s)
let qrSentToTelegramThisSession = false;

// WA Location pairing: nhớ location pin gần nhất per sender (TTL 5 phút)
// Dùng làm fallback GPS khi ảnh không có NoteCam stamp.
const recentLocations = new Map(); // senderNumber → { lat, lng, ts }
const LOCATION_TTL_MS = 5 * 60 * 1000;

function getRecentLocationFor(sender) {
  const v = recentLocations.get(sender);
  if (!v) return null;
  if (Date.now() - v.ts > LOCATION_TTL_MS) {
    recentLocations.delete(sender);
    return null;
  }
  return { lat: v.lat, lng: v.lng };
}

// Cleanup expired locations mỗi 60s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of recentLocations) {
    if (now - v.ts > LOCATION_TTL_MS) recentLocations.delete(k);
  }
}, 60_000).unref();

export function getClient() {
  return client;
}

export async function startWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: config.waSessionName,
      dataPath: config.waSessionDir,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });

  client.on('qr', async (qr) => {
    const pngPath = join(config.dataDir, 'qr.png');
    try {
      await QRCode.toFile(pngPath, qr, {
        width: 600,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      logger.info(`✓ QR đã lưu: ${pngPath}  (mở bằng image viewer rồi quét)`);
    } catch (err) {
      logger.warn({ err: err.message }, 'Không lưu được QR PNG');
    }
    logger.info('QR ASCII (dự phòng nếu PNG không mở được):');
    qrcodeTerminal.generate(qr, { small: true });

    // Gửi QR qua Telegram cho admin scan từ điện thoại — chỉ 1 lần per session
    if (!qrSentToTelegramThisSession) {
      try {
        await notifyAdminsPhoto(
          pngPath,
          '🔐 *WhatsApp bot cần scan QR mới*\n\n' +
            'Mở WhatsApp → ⋮ Linked devices → Link a device → quét ảnh trên.\n' +
            '_QR refresh mỗi ~60s, scan ngay nhé._',
        );
        qrSentToTelegramThisSession = true;
        logger.info('✓ QR đã gửi qua Telegram cho admin');
      } catch (err) {
        logger.warn({ err: err.message }, 'Không gửi được QR qua Telegram');
      }
    }
  });

  client.on('authenticated', () => {
    logger.info('✓ WhatsApp authenticated');
    qrSentToTelegramThisSession = false; // reset cho lần disconnect tới
  });

  client.on('auth_failure', (msg) => {
    logger.error({ msg }, 'WhatsApp auth failure');
  });

  client.on('ready', () => {
    logger.info(`✓ WhatsApp client ready (${config.waSessionName})`);
  });

  client.on('disconnected', async (reason) => {
    logger.warn({ reason }, 'WhatsApp disconnected — exiting để systemd restart');

    // Notify admin Telegram
    try {
      await notifyAdmins(
        `⚠️ *WhatsApp bot disconnected*\n\n` +
          `Lý do: \`${reason}\`\n` +
          `Bot sẽ tự restart trong ~10s.\n` +
          `Nếu session expire, QR mới sẽ được gửi tới đây.`,
      );
    } catch (err) {
      logger.warn({ err: err.message }, 'Không gửi được disconnect alert');
    }

    // Delay 2s cho HTTP request kịp finish, sau đó exit để systemd restart
    setTimeout(() => process.exit(1), 2000);
  });

  client.on('message', async (msg) => {
    try {
      await onMessage(msg);
    } catch (err) {
      logger.error({ err: err.message, stack: err.stack }, 'onMessage error');
    }
  });

  await client.initialize();
}

async function onMessage(msg) {
  // Bỏ qua broadcast / status
  if (msg.from === 'status@broadcast') return;

  const chat = await msg.getChat();
  const isGroup = chat.isGroup;

  // Lọc group nếu có cấu hình
  if (isGroup && config.allowedGroupNames.length > 0) {
    if (!config.allowedGroupNames.includes(chat.name)) return;
  }

  // Bỏ qua tin nhắn của chính bot
  if (msg.fromMe) return;

  const contact = await msg.getContact();
  const senderNumber = msg.author || msg.from; // group → msg.author = số người gửi
  const senderName =
    contact.pushname || contact.name || contact.number || senderNumber;

  logger.info(
    {
      chat: chat.name || chat.id._serialized,
      isGroup,
      type: msg.type,
      from: senderNumber,
      hasMedia: msg.hasMedia,
    },
    'incoming message',
  );

  // Xử lý location pin: lưu vào memory map để pair với ảnh sau (TTL 5 phút)
  if (msg.type === 'location' && msg.location) {
    recentLocations.set(senderNumber, {
      lat: Number(msg.location.latitude),
      lng: Number(msg.location.longitude),
      ts: Date.now(),
    });
    logger.info(
      { senderNumber, lat: msg.location.latitude, lng: msg.location.longitude },
      'Stored WA location pin for fallback GPS pairing',
    );
    return;
  }

  // Xử lý ảnh
  if (msg.type === 'image' && msg.hasMedia) {
    await handleIncomingImage(msg, chat, senderNumber, senderName);
    return;
  }

  // Xử lý text (HELP, STATUS)
  if (msg.type === 'chat') {
    const reply = await handleTextMessage(msg.body);
    if (reply) {
      await sendReply(chat, msg, reply, senderNumber);
    }
    return;
  }

  // Loại khác: bỏ qua
}

async function handleIncomingImage(msg, chat, senderNumber, senderName) {
  let media;
  try {
    media = await msg.downloadMedia();
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to download media');
    await sendReply(
      chat,
      msg,
      ES.MEDIA_DOWNLOAD_FAIL,
      senderNumber,
    );
    return;
  }

  if (!media || !media.data) {
    await sendReply(chat, msg, ES.MEDIA_EMPTY, senderNumber);
    return;
  }

  const buffer = Buffer.from(media.data, 'base64');
  const imagePath = saveMediaBuffer(buffer, media.mimetype);

  // GPS: whatsapp-web.js strip EXIF → priority cho vision OCR (NoteCam stamp).
  // Pass WA location pin (nếu sender vừa gửi trong 5 phút) làm fallback cho handler.
  const fallbackLoc = getRecentLocationFor(senderNumber);
  const result = await handleImageSubmission({
    waMessageId: msg.id._serialized,
    waChatId: chat.id._serialized,
    waSenderNumber: senderNumber,
    waSenderName: senderName,
    imagePath,
    caption: msg.body || '',
    gpsLatitude: fallbackLoc?.lat ?? null,
    gpsLongitude: fallbackLoc?.lng ?? null,
    gpsAddress: fallbackLoc ? 'WA location pin' : null,
  });

  logger.info({ submissionId: result.submission?.id, replyLen: result.reply?.length, hasMedia: !!result.mediaPath }, 'submission processed, sending reply');
  await sendReply(chat, msg, result.reply, senderNumber, result.mediaPath);
  logger.info({ submissionId: result.submission?.id }, 'reply sent');
}

/**
 * Load media từ disk → MessageMedia. Trả null nếu lỗi (caller fallback text-only).
 */
function loadMedia(mediaPath) {
  if (!mediaPath) return null;
  try {
    return MessageMedia.fromFilePath(mediaPath);
  } catch (err) {
    logger.warn({ err: err.message, mediaPath }, 'Failed to load media — fallback text only');
    return null;
  }
}

/**
 * Reply trong group (mention sender) hoặc DM tuỳ config.
 * mediaPath (optional): path ảnh đính kèm; body sẽ thành caption.
 */
async function sendReply(chat, originalMsg, body, senderNumber, mediaPath = null) {
  const mode = config.replyMode;
  const media = loadMedia(mediaPath);
  // wweb signature: sendMessage(content, options). Khi có media: content=media, body→options.caption.
  const content = media || body;
  const baseOpts = media ? { caption: body } : {};

  if (mode === 'dm' && chat.isGroup) {
    try {
      await client.sendMessage(senderNumber, content, baseOpts);
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to DM, falling back to group');
      await chat.sendMessage(content, baseOpts);
    }
    return;
  }

  // Reply trong chat hiện tại (group hoặc 1-1)
  try {
    if (chat.isGroup) {
      const senderId = senderNumber || '';
      const isLidFormat = senderId.endsWith('@lid');
      if (isLidFormat) {
        await chat.sendMessage(content, {
          ...baseOpts,
          quotedMessageId: originalMsg.id._serialized,
        });
      } else {
        // Mention sender. Khi có media, caption đã chứa body — prepend mention vào caption.
        if (media) {
          await chat.sendMessage(content, {
            caption: `@${senderId.split('@')[0]} ${body}`,
            mentions: [senderId],
            quotedMessageId: originalMsg.id._serialized,
          });
        } else {
          await chat.sendMessage(`@${senderId.split('@')[0]} ${body}`, {
            mentions: [senderId],
            quotedMessageId: originalMsg.id._serialized,
          });
        }
      }
    } else {
      if (media) {
        await chat.sendMessage(content, baseOpts);
      } else {
        await originalMsg.reply(body);
      }
    }
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack?.slice(0, 500) }, 'sendReply failed');
    // Last resort: nếu media fail, thử text-only. Nếu text fail, log và bỏ qua.
    try {
      if (media) {
        logger.warn('media send failed → retry text-only');
        await chat.sendMessage(body);
      } else {
        await chat.sendMessage(body);
      }
      logger.info('sendReply fallback succeeded');
    } catch (err2) {
      logger.error({ err: err2.message }, 'sendReply fallback also failed');
    }
  }
}

export async function stopWhatsApp() {
  if (client) {
    try {
      await client.destroy();
      logger.info('WhatsApp client stopped');
    } catch (err) {
      logger.warn({ err: err.message }, 'Error stopping WhatsApp client');
    }
  }
  await disconnectDb();
}
