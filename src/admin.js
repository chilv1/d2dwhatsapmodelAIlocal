/**
 * Express admin API:
 *  - Quản lý branch / team_leader / campaign (kèm upload template ảnh)
 *  - Xem submissions, daily reports
 *
 * Auth: header `x-api-key` phải khớp ADMIN_API_KEY trong .env
 */
import express from 'express';
import multer from 'multer';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { logger } from './logger.js';
import { db } from './db.js';

export function createAdminApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Auth middleware
  app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/health') return next();
    const key = req.header('x-api-key');
    if (!key || key !== config.adminApiKey) {
      return res.status(401).json({ error: 'Unauthorized: missing/invalid x-api-key' });
    }
    next();
  });

  // Multer cho upload template
  const storage = multer.diskStorage({
    destination: config.templateDir,
    filename: (req, file, cb) => {
      const ext = extname(file.originalname) || '.jpg';
      const code = (req.body.code || 'tpl').toLowerCase();
      cb(null, `template_${code}_${randomUUID().slice(0, 8)}${ext}`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Chỉ chấp nhận file ảnh'));
        return;
      }
      cb(null, true);
    },
  });

  // ─────────── Public routes ───────────

  app.get('/', (_, res) => {
    res.type('html').send(`
<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<title>Telecom Big - Campaign Bot</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#222}
h1{color:#d32f2f}code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:.92em}
.box{background:#f9f9f9;border-left:4px solid #d32f2f;padding:12px 18px;margin:16px 0}
</style></head><body>
<h1>Telecom Big — Campaign AI Bot</h1>
<p>Bot đang chạy. WhatsApp client: xem QR trong terminal nếu chưa đăng nhập.</p>
<div class="box"><b>Endpoints admin</b> (cần header <code>x-api-key</code>)<br>
GET /admin/campaigns &nbsp; · &nbsp; POST /admin/campaigns (multipart, field <code>template_image</code>)<br>
GET /admin/branches &nbsp; · &nbsp; POST /admin/branches<br>
GET /admin/team-leaders &nbsp; · &nbsp; POST /admin/team-leaders<br>
GET /admin/submissions?limit=20 &nbsp; · &nbsp; GET /admin/daily-reports
</div>
<div class="box"><b>WhatsApp</b><br>
Team leader gửi ảnh + caption <code>CAMPAIGN &lt;mã&gt;</code> hoặc <code>END &lt;mã&gt; SUBS=&lt;số&gt;</code> vào group bot có mặt.
</div>
</body></html>
    `);
  });

  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  // ─────────── Branches ───────────

  app.get('/admin/branches', (_req, res) => {
    res.json(db.prepare('SELECT * FROM branches ORDER BY id').all());
  });

  app.post('/admin/branches', (req, res) => {
    const { code, name, region = '' } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'code, name required' });
    try {
      const row = db
        .prepare(
          'INSERT INTO branches (code, name, region) VALUES (?, ?, ?) RETURNING *',
        )
        .get(code.toUpperCase(), name, region);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─────────── Team leaders ───────────

  app.get('/admin/team-leaders', (_req, res) => {
    res.json(db.prepare('SELECT * FROM team_leaders ORDER BY id').all());
  });

  app.post('/admin/team-leaders', (req, res) => {
    const { name, whatsapp_number, branch_id = null } = req.body;
    if (!name || !whatsapp_number)
      return res.status(400).json({ error: 'name, whatsapp_number required' });
    try {
      const row = db
        .prepare(
          'INSERT INTO team_leaders (name, whatsapp_number, branch_id) VALUES (?, ?, ?) RETURNING *',
        )
        .get(name, whatsapp_number, branch_id);
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─────────── Campaigns ───────────

  app.get('/admin/campaigns', (req, res) => {
    const activeOnly = req.query.active_only !== 'false';
    const sql = activeOnly
      ? 'SELECT * FROM campaigns WHERE is_active = 1 ORDER BY id DESC'
      : 'SELECT * FROM campaigns ORDER BY id DESC';
    res.json(db.prepare(sql).all());
  });

  app.post('/admin/campaigns', upload.single('template_image'), (req, res) => {
    const {
      code,
      name,
      description = '',
      template_requirements = '',
      target_subscribers,
      branch_id = null,
    } = req.body;

    if (!code || !name) return res.status(400).json({ error: 'code, name required' });
    if (!req.file) return res.status(400).json({ error: 'template_image required' });

    try {
      const row = db
        .prepare(
          `INSERT INTO campaigns
            (code, name, description, template_image_path, template_requirements,
             target_subscribers, branch_id, start_date, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), 1) RETURNING *`,
        )
        .get(
          code.toUpperCase(),
          name,
          description,
          req.file.path,
          template_requirements,
          parseInt(target_subscribers || config.defaultCampaignTarget, 10),
          branch_id ? parseInt(branch_id, 10) : null,
        );
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/admin/campaigns/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const fields = [];
    const values = [];
    for (const k of [
      'name',
      'description',
      'template_requirements',
      'target_subscribers',
      'branch_id',
      'is_active',
      'end_date',
    ]) {
      if (k in req.body) {
        fields.push(`${k} = ?`);
        values.push(req.body[k]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
    values.push(id);
    db.prepare(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id));
  });

  // ─────────── Submissions ───────────

  app.get('/admin/submissions', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
    const code = req.query.campaign_code;
    let rows;
    if (code) {
      rows = db
        .prepare(
          `SELECT s.* FROM submissions s
             JOIN campaigns c ON c.id = s.campaign_id
            WHERE UPPER(c.code) = ?
            ORDER BY s.submitted_at DESC LIMIT ?`,
        )
        .all(code.toUpperCase(), limit);
    } else {
      rows = db
        .prepare(
          'SELECT * FROM submissions ORDER BY submitted_at DESC LIMIT ?',
        )
        .all(limit);
    }
    res.json(rows);
  });

  // ─────────── Daily reports ───────────

  app.get('/admin/daily-reports', (req, res) => {
    const code = req.query.campaign_code;
    const date = req.query.report_date;
    const conds = [];
    const args = [];
    if (code) {
      conds.push(
        'campaign_id IN (SELECT id FROM campaigns WHERE UPPER(code) = ?)',
      );
      args.push(code.toUpperCase());
    }
    if (date) {
      conds.push('report_date = ?');
      args.push(date);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    res.json(
      db
        .prepare(
          `SELECT * FROM daily_reports ${where} ORDER BY report_date DESC`,
        )
        .all(...args),
    );
  });

  // Error handler (multer errors etc.)
  app.use((err, _req, res, _next) => {
    logger.error({ err: err.message }, 'admin route error');
    res.status(400).json({ error: err.message });
  });

  return app;
}
