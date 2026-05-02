/**
 * Bot side reader cho Setting model (key/value).
 * Cache 30s in-process — match CRM pattern (crm/lib/settings.ts).
 */
import { prisma } from './db.js';

const cache = new Map(); // key → { value, expiresAt }
const TTL_MS = 30_000;

export async function getSetting(key, defaultValue = null) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const row = await prisma.setting.findUnique({ where: { key } });
  const value = row?.value ?? defaultValue;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

export function invalidateSettingsCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}
