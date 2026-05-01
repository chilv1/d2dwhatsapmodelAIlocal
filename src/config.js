import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
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

  dataDir: resolve(process.env.DATA_DIR || './data'),
  uploadDir: resolve(process.env.UPLOAD_DIR || './data/uploads'),
  templateDir: resolve(process.env.TEMPLATE_DIR || './data/templates'),
  dbPath: resolve(process.env.DB_PATH || './data/telecombig.db'),
  waSessionDir: resolve(process.env.WA_SESSION_DIR || './data/wa-session'),

  defaultCampaignTarget: parseInt(process.env.DEFAULT_CAMPAIGN_TARGET || '20', 10),
  similarityThreshold: parseInt(process.env.SIMILARITY_THRESHOLD || '70', 10),

  logLevel: process.env.LOG_LEVEL || 'info',
};

for (const dir of [config.dataDir, config.uploadDir, config.templateDir, config.waSessionDir]) {
  mkdirSync(dir, { recursive: true });
}
