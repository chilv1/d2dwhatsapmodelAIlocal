/**
 * Compose ảnh side-by-side để promotor so sánh trực quan template vs ảnh mình.
 * Layout: header strip 40px (nhãn PLANTILLA xanh / TU FOTO đỏ) + 2 ảnh 600x760 (fit=contain).
 * Output: JPEG 1200x800 ~150-300KB.
 */
import sharp from 'sharp';

const TARGET_W = 600;
const TARGET_H = 760;
const HEADER_H = 40;
const TOTAL_W = TARGET_W * 2;
const TOTAL_H = HEADER_H + TARGET_H;

export async function composeComparison({ templatePath, userPath, outputPath }) {
  const [tplBuf, usrBuf] = await Promise.all([
    sharp(templatePath)
      .resize(TARGET_W, TARGET_H, { fit: 'contain', background: '#ffffff' })
      .toBuffer(),
    sharp(userPath)
      .resize(TARGET_W, TARGET_H, { fit: 'contain', background: '#ffffff' })
      .toBuffer(),
  ]);

  const headerSvg = Buffer.from(
    `<svg width="${TOTAL_W}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${TARGET_W}" height="${HEADER_H}" fill="#10b981"/>
      <rect x="${TARGET_W}" width="${TARGET_W}" height="${HEADER_H}" fill="#ef4444"/>
      <text x="${TARGET_W / 2}" y="28" font-family="Arial,sans-serif" font-size="22"
            font-weight="bold" fill="white" text-anchor="middle">PLANTILLA</text>
      <text x="${TARGET_W + TARGET_W / 2}" y="28" font-family="Arial,sans-serif" font-size="22"
            font-weight="bold" fill="white" text-anchor="middle">TU FOTO</text>
    </svg>`,
  );

  await sharp({
    create: {
      width: TOTAL_W,
      height: TOTAL_H,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([
      { input: headerSvg, left: 0, top: 0 },
      { input: tplBuf, left: 0, top: HEADER_H },
      { input: usrBuf, left: TARGET_W, top: HEADER_H },
    ])
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  return outputPath;
}
