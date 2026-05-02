/**
 * Image quality pre-check — chạy TRƯỚC khi gọi vision AI để save cost.
 * Reject ảnh quá nhỏ / quá lớn / không phải image hợp lệ.
 *
 * Note: blur detection (Laplacian variance) cần thư viện image processing nặng (sharp/jimp).
 * Skip cho MVP — chỉ check basic dimensions + size + format.
 */
import { statSync, readFileSync } from 'node:fs';

const MIN_BYTES = 10_000; // 10KB — ảnh dưới ngưỡng này thường corrupt hoặc placeholder
const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const MIN_DIMENSION = 400; // pixel — ảnh nhỏ hơn không đủ chi tiết để AI evaluate

/**
 * Đọc dimensions JPEG từ raw buffer (không cần thư viện ngoài).
 * Trả về null nếu không parse được.
 */
function getJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null; // not JPEG
  let i = 2;
  while (i < buffer.length) {
    while (buffer[i] !== 0xff && i < buffer.length) i++;
    while (buffer[i] === 0xff && i < buffer.length) i++;
    const marker = buffer[i];
    i++;
    // SOF markers (Start Of Frame)
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      i += 3; // skip length + precision
      const height = (buffer[i] << 8) | buffer[i + 1];
      const width = (buffer[i + 2] << 8) | buffer[i + 3];
      return { width, height };
    }
    const length = (buffer[i] << 8) | buffer[i + 1];
    i += length;
  }
  return null;
}

/**
 * Đọc dimensions PNG từ raw buffer.
 */
function getPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  const sig = buffer.slice(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') return null;
  // IHDR chunk starts at byte 16
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * Quality check 1 file ảnh.
 * @returns {{ok:boolean, reason?:string}}
 */
export function checkImageQuality(filePath) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch (e) {
    return { ok: false, reason: 'Không đọc được file ảnh' };
  }

  if (stat.size < MIN_BYTES) {
    return { ok: false, reason: `Ảnh quá nhỏ (${stat.size} bytes < ${MIN_BYTES})` };
  }
  if (stat.size > MAX_BYTES) {
    return { ok: false, reason: `Ảnh quá lớn (${(stat.size / 1024 / 1024).toFixed(1)} MB > 15 MB)` };
  }

  // Read first 64KB để parse header dimensions
  let buffer;
  try {
    const fd = readFileSync(filePath);
    buffer = fd.slice(0, Math.min(65536, fd.length));
  } catch (e) {
    return { ok: false, reason: 'Lỗi đọc buffer ảnh' };
  }

  const dims = getJpegDimensions(buffer) || getPngDimensions(buffer);
  if (!dims) {
    return { ok: false, reason: 'File không phải JPEG/PNG hợp lệ' };
  }

  if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
    return {
      ok: false,
      reason: `Ảnh độ phân giải thấp (${dims.width}x${dims.height} < ${MIN_DIMENSION}px)`,
    };
  }

  return { ok: true };
}
