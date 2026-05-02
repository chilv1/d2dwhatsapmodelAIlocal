/**
 * Vision result cache + submission throttle.
 * Cache key: SHA-256(image buffer) + campaignId + detectionMode flag.
 * Throttle: in-memory Map, key = senderNumber:campaignId, TTL 5s.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prisma } from './db.js';
import { logger } from './logger.js';

const THROTTLE_TTL_MS = 5_000;
const throttleMap = new Map(); // "sender:campaignId" → expiresAt

// Cleanup expired throttle entries mỗi 30s
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of throttleMap) {
    if (exp < now) throttleMap.delete(k);
  }
}, 30_000).unref();

export function imageHash(filePathOrBuffer) {
  const buf =
    typeof filePathOrBuffer === 'string'
      ? readFileSync(filePathOrBuffer)
      : filePathOrBuffer;
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Lookup cached evaluation. Returns null nếu miss hoặc cache disabled.
 */
export async function getCachedEvaluation({ imageHash, campaignId, detectionMode }) {
  try {
    const row = await prisma.visionCache.findUnique({
      where: {
        uq_vision_cache: {
          imageHash,
          campaignId,
          detectionMode: !!detectionMode,
        },
      },
    });
    if (!row) return null;
    // Increment hit counter (fire-and-forget)
    prisma.visionCache
      .update({
        where: { id: row.id },
        data: { hits: { increment: 1 }, lastHitAt: new Date() },
      })
      .catch((e) => logger.warn({ err: e.message }, 'cache hit update failed'));
    return JSON.parse(row.evaluationJson);
  } catch (err) {
    logger.warn({ err: err.message }, 'getCachedEvaluation failed');
    return null;
  }
}

/**
 * Lưu evaluation vào cache. Idempotent (dùng upsert).
 */
export async function setCachedEvaluation({
  imageHash,
  campaignId,
  detectionMode,
  evaluation,
}) {
  try {
    await prisma.visionCache.upsert({
      where: {
        uq_vision_cache: {
          imageHash,
          campaignId,
          detectionMode: !!detectionMode,
        },
      },
      update: { evaluationJson: JSON.stringify(evaluation) },
      create: {
        imageHash,
        campaignId,
        detectionMode: !!detectionMode,
        evaluationJson: JSON.stringify(evaluation),
      },
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'setCachedEvaluation failed');
  }
}

/**
 * Throttle check: nếu sender đã gửi cho campaign này trong 5s gần đây → return true.
 * Side effect: nếu chưa throttle, MARK throttle (sender không thể gửi lại trong 5s nữa).
 */
export function isThrottled({ senderNumber, campaignId }) {
  const key = `${senderNumber}:${campaignId}`;
  const now = Date.now();
  const expires = throttleMap.get(key);
  if (expires && expires > now) {
    return true;
  }
  throttleMap.set(key, now + THROTTLE_TTL_MS);
  return false;
}

export function clearThrottle({ senderNumber, campaignId }) {
  throttleMap.delete(`${senderNumber}:${campaignId}`);
}
