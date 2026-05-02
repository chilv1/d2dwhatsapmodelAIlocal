import { mkdirSync } from 'node:fs';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// PROJECT_ROOT = .../CTYAI  (config.js ở bot/src/, đi lên 2 cấp)
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// Load .env từ PROJECT_ROOT (không phụ thuộc cwd)
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Resolve path: nếu là absolute hoặc bắt đầu bằng '.', resolve từ PROJECT_ROOT,
 * không phải từ cwd. Đảm bảo bot chạy đúng dù cwd ở đâu.
 */
function resolveFromRoot(envValue, defaultRel) {
  const value = envValue || defaultRel;
  if (isAbsolute(value)) return value;
  // Strip leading './' để join sạch
  const clean = value.replace(/^\.\//, '');
  return join(PROJECT_ROOT, clean);
}

export const config = {
  openaiApiKey: required('OPENAI_API_KEY'),
  visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4o',

  waSessionName: process.env.WA_SESSION_NAME || 'telecombig-bot',
  replyMode: (process.env.REPLY_MODE || 'group').toLowerCase(),
  allowedGroupNames: (process.env.ALLOWED_GROUP_NAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  adminPort: parseInt(process.env.ADMIN_PORT || '3000', 10),
  adminApiKey: process.env.ADMIN_API_KEY || 'changeme-admin-key',

  projectRoot: PROJECT_ROOT,
  dataDir: resolveFromRoot(process.env.DATA_DIR, 'data'),
  uploadDir: resolveFromRoot(process.env.UPLOAD_DIR, 'data/uploads'),
  templateDir: resolveFromRoot(process.env.TEMPLATE_DIR, 'data/templates'),
  dbPath: resolveFromRoot(process.env.DB_PATH, 'data/telecombig.db'),
  waSessionDir: resolveFromRoot(process.env.WA_SESSION_DIR, 'data/wa-session'),

  defaultCampaignTarget: parseInt(process.env.DEFAULT_CAMPAIGN_TARGET || '20', 10),
  similarityThreshold: parseInt(process.env.SIMILARITY_THRESHOLD || '70', 10),

  logLevel: process.env.LOG_LEVEL || 'info',
};

for (const dir of [config.dataDir, config.uploadDir, config.templateDir, config.waSessionDir]) {
  mkdirSync(dir, { recursive: true });
}
