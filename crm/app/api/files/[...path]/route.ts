/**
 * Image serving route — stream file từ data/uploads/ và data/templates/.
 * - Yêu cầu user đã login (auth check).
 * - Path traversal protection: chỉ cho phép paths trong 2 thư mục cho phép.
 *
 * URL pattern: /api/files/<filename>          → resolve trong uploads/
 *              /api/files/template/<filename> → resolve trong templates/
 *              /api/files/upload/<filename>   → resolve trong uploads/ (alias)
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolve, normalize, basename } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { auth } from '@/auth';

// Resolve data directory:
// 1. env DATA_DIR (production set explicit, vd /opt/telecombig/data)
// 2. cwd-based fallback: nếu chạy từ crm/ → ../data, else ./data
function getDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const cwd = process.cwd();
  const root = cwd.endsWith('/crm') ? resolve(cwd, '..') : cwd;
  return resolve(root, 'data');
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path: parts } = await params;
  if (!parts || parts.length === 0) {
    return NextResponse.json({ error: 'Bad path' }, { status: 400 });
  }

  // Lý giải subfolder
  const dataDir = getDataDir();
  let baseDir: string;
  let filename: string;
  if (parts[0] === 'template' || parts[0] === 'templates') {
    baseDir = resolve(dataDir, 'templates');
    filename = parts.slice(1).join('/');
  } else if (parts[0] === 'upload' || parts[0] === 'uploads') {
    baseDir = resolve(dataDir, 'uploads');
    filename = parts.slice(1).join('/');
  } else {
    baseDir = resolve(dataDir, 'uploads');
    filename = parts.join('/');
  }

  if (!filename) {
    return NextResponse.json({ error: 'Bad filename' }, { status: 400 });
  }

  // Path traversal protection: filename phải chỉ là basename, không có '..' hay '/'
  const safe = basename(filename);
  if (safe !== filename) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const fullPath = normalize(resolve(baseDir, safe));
  // Double-check resolved path nằm trong baseDir (defense in depth)
  if (!fullPath.startsWith(baseDir)) {
    return NextResponse.json({ error: 'Path traversal blocked' }, { status: 400 });
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const stat = statSync(fullPath);
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'Not a file' }, { status: 400 });
  }

  const ext = '.' + (safe.split('.').pop()?.toLowerCase() || '');
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

  const buffer = readFileSync(fullPath);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Cache-Control': 'private, max-age=300',
    },
  });
}
