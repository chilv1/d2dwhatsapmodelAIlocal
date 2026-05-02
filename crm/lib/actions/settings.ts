'use server';
/**
 * Server Actions cho app settings — admin only.
 * Update Telegram token + SMTP config từ UI, lưu vào DB.
 */
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { setSettings } from '@/lib/settings';

const PASSWORD_PLACEHOLDER = '__keep__'; // UI gửi giá trị này = giữ nguyên (không đổi)

/**
 * Telegram bot token chuẩn: <bot_id>:<token_string>
 *   - bot_id: 8-10 chữ số
 *   - token: 35+ ký tự letters/digits/dash/underscore
 */
const TELEGRAM_TOKEN_RE = /^[0-9]{8,12}:[A-Za-z0-9_-]{30,}$/;

export async function updateTelegramSettingsAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const botTokenRaw = String(formData.get('bot_token') || '');
  // Trim + remove invisible chars (zero-width space, NBSP)
  const botToken = botTokenRaw.replace(/[\s​-‍﻿ ]+/g, '').trim();

  // Nếu user gửi placeholder = giữ nguyên (không update), '' = clear
  if (botToken === PASSWORD_PLACEHOLDER) {
    revalidatePath('/dashboard/notifications');
    return;
  }

  // Validate format nếu không rỗng
  if (botToken && !TELEGRAM_TOKEN_RE.test(botToken)) {
    throw new Error(
      `Token không đúng format. Phải là <số>:<chuỗi>, vd "123456789:AAH...". ` +
        `Token bạn nhập: "${botToken.slice(0, 15)}...". ` +
        `Kiểm tra lại từ @BotFather, copy chính xác.`,
    );
  }

  await setSettings([
    { key: 'telegram.bot_token', value: botToken || null, isSecret: true },
  ]);
  await audit({
    userId,
    action: 'settings.update_telegram',
    entityType: 'settings',
    newValue: { tokenSet: !!botToken },
  });

  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard/reports');
}

export async function updateSmtpSettingsAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const stripWs = (s: string) => s.replace(/\s+/g, '').trim();
  const host = stripWs(String(formData.get('host') || ''));
  const port = stripWs(String(formData.get('port') || ''));
  const user = stripWs(String(formData.get('user') || ''));
  // Password: STRIP TẤT CẢ whitespace (Gmail App Password có space cho dễ đọc nhưng SMTP cần raw)
  const password = stripWs(String(formData.get('password') || ''));
  const from = String(formData.get('from') || '').trim();

  // Validate host: hostname không trùng lặp (smtp.gmail.comsmtp.gmail.com)
  if (host) {
    // Detect duplicated TLD (.comx.com hoặc .nety.net)
    const dupMatch = host.match(/^(.+?)([a-z0-9-]+\.[a-z]{2,})$/i);
    if (dupMatch && host.endsWith(dupMatch[2]) && host.includes(dupMatch[2] + dupMatch[2].slice(0, 1))) {
      throw new Error(`SMTP host "${host}" có vẻ bị nhân đôi. Có ý là "${dupMatch[2]}" không?`);
    }
    if (!/^[a-z0-9.-]+$/i.test(host)) {
      throw new Error(`SMTP host "${host}" không hợp lệ — chỉ chữ/số/dấu chấm/gạch ngang.`);
    }
  }

  const updates: Array<{ key: string; value: string | null; isSecret?: boolean }> = [
    { key: 'smtp.host', value: host || null },
    { key: 'smtp.port', value: port || null },
    { key: 'smtp.user', value: user || null },
    { key: 'smtp.from', value: from || null },
  ];
  if (password !== PASSWORD_PLACEHOLDER) {
    updates.push({ key: 'smtp.password', value: password || null, isSecret: true });
  }

  await setSettings(updates);
  await audit({
    userId,
    action: 'settings.update_smtp',
    entityType: 'settings',
    newValue: {
      host: host || null,
      port: port || null,
      user: user || null,
      passwordChanged: password !== PASSWORD_PLACEHOLDER,
      from: from || null,
    },
  });

  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard/reports');
}
