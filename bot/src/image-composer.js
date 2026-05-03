/**
 * Compose ảnh side-by-side để promotor so sánh trực quan template vs ảnh mình.
 * Layout: header strip 40px (PLANTILLA xanh / TU FOTO đỏ) + 2 ảnh 600x760 (fit=contain).
 *
 * issueBoxes (optional): array bbox normalized 0-1 [{x,y,w,h}]. Khi có, vẽ ô đỏ +
 * số thứ tự lên ảnh user side để promotor biết vị trí thiếu item.
 *
 * Output: JPEG 1200x800 ~60-300KB.
 */
import sharp from 'sharp';

const TARGET_W = 600;
const TARGET_H = 760;
const HEADER_H = 40;
const TOTAL_W = TARGET_W * 2;
const TOTAL_H = HEADER_H + TARGET_H;

function buildBoxesSvg(boxes, w, h) {
  const rects = boxes
    .map((b, i) => {
      const x = Math.round(b.x * w);
      const y = Math.round(b.y * h);
      const bw = Math.round(b.w * w);
      const bh = Math.round(b.h * h);
      return `
        <rect x="${x}" y="${y}" width="${bw}" height="${bh}"
              fill="none" stroke="#ef4444" stroke-width="4"/>
        <circle cx="${x + 16}" cy="${y + 16}" r="14" fill="#ef4444"/>
        <text x="${x + 16}" y="${y + 22}" font-family="Arial,sans-serif" font-size="18"
              font-weight="bold" fill="white" text-anchor="middle">${i + 1}</text>
      `;
    })
    .join('');
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

/**
 * @param {object} args
 * @param {string} args.templatePath
 * @param {string} args.userPath
 * @param {string} args.outputPath
 * @param {Array<{x:number,y:number,w:number,h:number}>} [args.issueBoxes]
 * @param {Array<{x:number,y:number,w:number,h:number}>} [args.templateHighlightBoxes]
 */
export async function composeComparison({
  templatePath,
  userPath,
  outputPath,
  issueBoxes = [],
  templateHighlightBoxes = [],
}) {
  // Resize template — overlay red boxes nếu có
  let tplBuf = await sharp(templatePath)
    .resize(TARGET_W, TARGET_H, { fit: 'contain', background: '#ffffff' })
    .toBuffer();

  if (templateHighlightBoxes.length > 0) {
    const overlaySvg = Buffer.from(buildBoxesSvg(templateHighlightBoxes, TARGET_W, TARGET_H));
    tplBuf = await sharp(tplBuf)
      .composite([{ input: overlaySvg, left: 0, top: 0 }])
      .toBuffer();
  }

  // Resize user — composite bbox overlay nếu có
  let usrBuf = await sharp(userPath)
    .resize(TARGET_W, TARGET_H, { fit: 'contain', background: '#ffffff' })
    .toBuffer();

  if (issueBoxes.length > 0) {
    const overlaySvg = Buffer.from(buildBoxesSvg(issueBoxes, TARGET_W, TARGET_H));
    usrBuf = await sharp(usrBuf)
      .composite([{ input: overlaySvg, left: 0, top: 0 }])
      .toBuffer();
  }

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
