/**
 * App settings — key-value store trong DB.
 * Ưu tiên DB > env. Settings được cache 30s in-process để giảm query.
 */
import { prisma } from '@/lib/prisma';

const CACHE_TTL_MS = 30_000;

let cache: { ts: number; map: Map<string, string | null> } | null = null;

async function loadAll(): Promise<Map<string, string | null>> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.map;
  const rows = await prisma.setting.findMany({ select: { key: true, value: true } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  cache = { ts: now, map };
  return map;
}

/** Invalidate cache — gọi sau khi update settings để config có hiệu lực ngay. */
export function invalidateSettingsCache() {
  cache = null;
  // Cũng clear nodemailer transporter (sẽ re-create với config mới)
  resetEmailTransporter();
}

/**
 * Get setting với fallback env. Trả về null nếu cả 2 đều null/empty.
 */
export async function getSetting(
  dbKey: string,
  envKey?: string,
): Promise<string | null> {
  const map = await loadAll();
  const fromDb = map.get(dbKey);
  if (fromDb) return fromDb;
  if (envKey) {
    const fromEnv = process.env[envKey];
    if (fromEnv) return fromEnv;
  }
  return null;
}

/**
 * Set 1 hoặc nhiều keys vào DB. Giá trị empty string = xoá (set null).
 * isSecret = đánh dấu password fields (không log ra console).
 */
export async function setSettings(
  entries: Array<{ key: string; value: string | null; isSecret?: boolean }>,
) {
  for (const e of entries) {
    const value = e.value && e.value.trim() ? e.value : null;
    await prisma.setting.upsert({
      where: { key: e.key },
      update: { value, isSecret: e.isSecret ?? false },
      create: { key: e.key, value, isSecret: e.isSecret ?? false },
    });
  }
  invalidateSettingsCache();
}

// ─────────────────────────────────────────────
// Helpers cho từng channel
// ─────────────────────────────────────────────

export type TelegramConfig = {
  botToken: string | null;
};

export type SmtpConfig = {
  host: string | null;
  port: number;
  user: string | null;
  password: string | null;
  from: string;
};

export async function getTelegramConfig(): Promise<TelegramConfig> {
  return {
    botToken: await getSetting('telegram.bot_token', 'TELEGRAM_BOT_TOKEN'),
  };
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const portStr = await getSetting('smtp.port', 'SMTP_PORT');
  return {
    host: await getSetting('smtp.host', 'SMTP_HOST'),
    port: parseInt(portStr || '587', 10),
    user: await getSetting('smtp.user', 'SMTP_USER'),
    password: await getSetting('smtp.password', 'SMTP_PASSWORD'),
    from:
      (await getSetting('smtp.from', 'SMTP_FROM')) ||
      'Telecom Big CRM <noreply@telecombig.pe>',
  };
}

// ─────────────────────────────────────────────
// Transporter cache management (cho email.ts)
// ─────────────────────────────────────────────

let emailTransporterResetCallbacks: Array<() => void> = [];

/** email.ts đăng ký callback để clear cache khi settings thay đổi. */
export function registerEmailTransporterReset(cb: () => void) {
  emailTransporterResetCallbacks.push(cb);
}

function resetEmailTransporter() {
  for (const cb of emailTransporterResetCallbacks) cb();
}
