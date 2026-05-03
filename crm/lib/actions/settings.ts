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

export async function updateVisionSettingsAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const detectionEnabled = formData.get('detection_enabled') === 'on';
  const cacheEnabled = formData.get('cache_enabled') === 'on';
  const throttleEnabled = formData.get('throttle_enabled') === 'on';
  const templateAsTextEnabled = formData.get('template_as_text_enabled') === 'on';
  // Configurable throttle window — clamp [1, 300] giây
  const throttleSecRaw = parseInt(String(formData.get('throttle_seconds') || '5'), 10);
  const throttleSec = Number.isFinite(throttleSecRaw)
    ? Math.max(1, Math.min(300, throttleSecRaw))
    : 5;
  // Vision model — preset hoặc custom string. Empty = fallback env OPENAI_VISION_MODEL.
  const modelRaw = String(formData.get('model') || '').trim();
  const modelCustom = String(formData.get('model_custom') || '').trim();
  const visionModel = modelRaw === '__custom__' ? modelCustom : modelRaw;

  await setSettings([
    { key: 'vision.detection_mode_enabled', value: detectionEnabled ? '1' : '0', isSecret: false },
    { key: 'vision.cache_enabled', value: cacheEnabled ? '1' : '0', isSecret: false },
    { key: 'vision.template_as_text_enabled', value: templateAsTextEnabled ? '1' : '0', isSecret: false },
    { key: 'submission.throttle_enabled', value: throttleEnabled ? '1' : '0', isSecret: false },
    { key: 'submission.throttle_seconds', value: String(throttleSec), isSecret: false },
    { key: 'vision.model', value: visionModel || null, isSecret: false },
  ]);
  await audit({
    userId,
    action: 'settings.update_vision',
    entityType: 'settings',
    newValue: { detectionEnabled, cacheEnabled, throttleEnabled, templateAsTextEnabled, throttleSeconds: throttleSec, visionModel: visionModel || '(env fallback)' },
  });

  revalidatePath('/dashboard/config-ai');
  revalidatePath('/dashboard/notifications');
}

/**
 * Toggle ON/OFF cho menu items phụ (Leaderboard, Branches).
 * Default ON nếu setting chưa tồn tại.
 */
export async function updateFeatureFlagsAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const leaderboardEnabled = formData.get('leaderboard_enabled') === 'on';
  const branchesEnabled = formData.get('branches_enabled') === 'on';

  await setSettings([
    {
      key: 'feature.leaderboard_enabled',
      value: leaderboardEnabled ? '1' : '0',
      isSecret: false,
    },
    {
      key: 'feature.branches_enabled',
      value: branchesEnabled ? '1' : '0',
      isSecret: false,
    },
  ]);

  await audit({
    userId,
    action: 'settings.update_feature_flags',
    entityType: 'settings',
    newValue: { leaderboardEnabled, branchesEnabled },
  });

  revalidatePath('/dashboard', 'layout'); // refresh sidebar
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
