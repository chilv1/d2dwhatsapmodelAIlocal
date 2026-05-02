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
import {
  handleImageSubmission,
  saveMediaBuffer,
  handleTextMessage,
} from './handler.js';

let client;

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
  });

  client.on('authenticated', () => {
    logger.info('✓ WhatsApp authenticated');
  });

  client.on('auth_failure', (msg) => {
    logger.error({ msg }, 'WhatsApp auth failure');
  });

  client.on('ready', () => {
    logger.info(`✓ WhatsApp client ready (${config.waSessionName})`);
  });

  client.on('disconnected', (reason) => {
    logger.warn({ reason }, 'WhatsApp disconnected');
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
      'Không tải được ảnh từ WhatsApp, vui lòng gửi lại.',
      senderNumber,
    );
    return;
  }

  if (!media || !media.data) {
    await sendReply(chat, msg, 'Ảnh trống, gửi lại nhé.', senderNumber);
    return;
  }

  const buffer = Buffer.from(media.data, 'base64');
  const imagePath = saveMediaBuffer(buffer, media.mimetype);

  // GPS: whatsapp-web.js không trả EXIF → để null. Nếu user gửi LOCATION riêng,
  // có thể mở rộng sau bằng cách lưu location message liền kề.
  const result = await handleImageSubmission({
    waMessageId: msg.id._serialized,
    waChatId: chat.id._serialized,
    waSenderNumber: senderNumber,
    waSenderName: senderName,
    imagePath,
    caption: msg.body || '',
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAddress: null,
  });

  await sendReply(chat, msg, result.reply, senderNumber);
}

/**
 * Reply trong group (mention sender) hoặc DM tuỳ config.
 */
async function sendReply(chat, originalMsg, body, senderNumber) {
  const mode = config.replyMode;

  if (mode === 'dm' && chat.isGroup) {
    // DM cho người gửi
    try {
      await client.sendMessage(senderNumber, body);
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to DM, falling back to group');
      await chat.sendMessage(body);
    }
    return;
  }

  // Reply trong chat hiện tại (group hoặc 1-1)
  try {
    if (chat.isGroup) {
      // Mention sender để nổi bật
      const senderId = senderNumber;
      await chat.sendMessage(`@${senderId.split('@')[0]} ${body}`, {
        mentions: [senderId],
        quotedMessageId: originalMsg.id._serialized,
      });
    } else {
      await originalMsg.reply(body);
    }
  } catch (err) {
    logger.error({ err: err.message }, 'sendReply failed');
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
