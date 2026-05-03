/**
 * Vision result cache + submission throttle.
 * Cache key: SHA-256(image buffer) + campaignId + detectionMode flag.
 * Throttle: in-memory Map, key = senderNumber:campaignId, TTL 5s.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { getSetting } from './settings.js';

const DEFAULT_THROTTLE_TTL_MS = 5_000;
const throttleMap = new Map(); // "sender:campaignId" → expiresAt

async function getThrottleTtlMs() {
  const raw = await getSetting('submission.throttle_seconds', '5');
  const sec = parseInt(raw || '5', 10);
  if (!Number.isFinite(sec) || sec < 1) return DEFAULT_THROTTLE_TTL_MS;
  return Math.min(300, sec) * 1000;
}

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
 * v2: thêm templateMode ('image'|'text') vào key — 2 modes có prompt khác → kết quả khác → cache riêng.
 * @returns {Promise<{evaluation:object, compareImagePath:string|null}|null>}
 */
export async function getCachedEvaluation({
  imageHash,
  campaignId,
  detectionMode,
  templateMode = 'image',
}) {
  try {
    const row = await prisma.visionCache.findUnique({
      where: {
        uq_vision_cache: {
          imageHash,
          campaignId,
          detectionMode: !!detectionMode,
          templateMode,
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
    return {
      evaluation: JSON.parse(row.evaluationJson),
      compareImagePath: row.compareImagePath || null,
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'getCachedEvaluation failed');
    return null;
  }
}

/**
 * Lưu evaluation vào cache. Idempotent (dùng upsert).
 * compareImagePath optional — chỉ set khi compose thành công.
 */
export async function setCachedEvaluation({
  imageHash,
  campaignId,
  detectionMode,
  templateMode = 'image',
  evaluation,
  compareImagePath = null,
}) {
  try {
    await prisma.visionCache.upsert({
      where: {
        uq_vision_cache: {
          imageHash,
          campaignId,
          detectionMode: !!detectionMode,
          templateMode,
        },
      },
      update: {
        evaluationJson: JSON.stringify(evaluation),
        ...(compareImagePath ? { compareImagePath } : {}),
      },
      create: {
        imageHash,
        campaignId,
        detectionMode: !!detectionMode,
        templateMode,
        evaluationJson: JSON.stringify(evaluation),
        compareImagePath,
      },
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'setCachedEvaluation failed');
  }
}

/**
 * Throttle check: nếu sender đã gửi cho campaign này trong window (config) → return true.
 * Side effect: nếu chưa throttle, MARK throttle (sender không thể gửi lại trong window nữa).
 * Window đọc từ DB setting `submission.throttle_seconds` (default 5s, clamp 1-300s).
 */
export async function isThrottled({ senderNumber, campaignId }) {
  const key = `${senderNumber}:${campaignId}`;
  const now = Date.now();
  const expires = throttleMap.get(key);
  if (expires && expires > now) {
    return true;
  }
  const ttlMs = await getThrottleTtlMs();
  throttleMap.set(key, now + ttlMs);
  return false;
}

export function clearThrottle({ senderNumber, campaignId }) {
  throttleMap.delete(`${senderNumber}:${campaignId}`);
}

/**
 * Tăng counter daily cho 1 metric. Format date 'YYYY-MM-DD' local.
 * @param {string} metric — tên metric, vd 'cache_hit', 'vision_tokens_input_text'
 * @param {number} [amount=1] — số lượng tăng (vd token count, không chỉ event count)
 * Không throw — log warn nếu fail.
 */
export async function recordMetric(metric, amount = 1) {
  try {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await prisma.botMetric.upsert({
      where: { uq_metric_date: { date, metric } },
      update: { count: { increment: amount } },
      create: { date, metric, count: amount },
    });
  } catch (err) {
    logger.warn({ err: err.message, metric }, 'recordMetric failed');
  }
}
