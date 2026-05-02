/**
 * Express admin API (legacy — sẽ migrate dần sang CRM Next.js sau M2-M3).
 * Quản lý: branches / team_leaders / campaigns / submissions / daily_reports.
 * Auth: header `x-api-key` phải khớp ADMIN_API_KEY trong .env
 */
import express from 'express';
import multer from 'multer';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { logger } from './logger.js';
import { prisma } from './db.js';

export function createAdminApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Auth middleware (skip cho /, /health)
  app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/health') return next();
    const key = req.header('x-api-key');
    if (!key || key !== config.adminApiKey) {
      return res
        .status(401)
        .json({ error: 'Unauthorized: missing/invalid x-api-key' });
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
<p>Bot đang chạy. WhatsApp client: xem QR (data/qr.png) nếu chưa đăng nhập.</p>
<div class="box"><b>Endpoints admin</b> (cần header <code>x-api-key</code>)<br>
GET/POST /admin/branches · /admin/team-leaders · /admin/campaigns · /admin/submissions · /admin/daily-reports
</div>
</body></html>
    `);
  });

  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  // ─────────── Branches ───────────

  app.get('/admin/branches', async (_req, res, next) => {
    try {
      const rows = await prisma.branch.findMany({ orderBy: { id: 'asc' } });
      res.json(rows);
    } catch (e) { next(e); }
  });

  app.post('/admin/branches', async (req, res, next) => {
    try {
      const { code, name, region = '' } = req.body;
      if (!code || !name) return res.status(400).json({ error: 'code, name required' });
      const row = await prisma.branch.create({
        data: { code: code.toUpperCase(), name, region: region || null },
      });
      res.json(row);
    } catch (e) { next(e); }
  });

  // ─────────── Team leaders ───────────

  app.get('/admin/team-leaders', async (_req, res, next) => {
    try {
      const rows = await prisma.teamLeader.findMany({ orderBy: { id: 'asc' } });
      res.json(rows);
    } catch (e) { next(e); }
  });

  app.post('/admin/team-leaders', async (req, res, next) => {
    try {
      const { name, whatsapp_number, branch_id = null } = req.body;
      if (!name || !whatsapp_number) {
        return res.status(400).json({ error: 'name, whatsapp_number required' });
      }
      const row = await prisma.teamLeader.create({
        data: {
          name,
          whatsappNumber: whatsapp_number,
          branchId: branch_id ? parseInt(branch_id, 10) : null,
        },
      });
      res.json(row);
    } catch (e) { next(e); }
  });

  // ─────────── Campaigns ───────────

  app.get('/admin/campaigns', async (req, res, next) => {
    try {
      const activeOnly = req.query.active_only !== 'false';
      const rows = await prisma.campaign.findMany({
        where: activeOnly ? { isActive: true } : {},
        orderBy: { id: 'desc' },
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  app.post('/admin/campaigns', upload.single('template_image'), async (req, res, next) => {
    try {
      const {
        code, name,
        description = '',
        template_requirements = '',
        target_subscribers,
        branch_id = null,
      } = req.body;
      if (!code || !name) return res.status(400).json({ error: 'code, name required' });
      if (!req.file) return res.status(400).json({ error: 'template_image required' });

      const row = await prisma.campaign.create({
        data: {
          code: code.toUpperCase(),
          name,
          description: description || null,
          templateImagePath: req.file.path,
          templateRequirements: template_requirements || null,
          targetSubscribers: parseInt(target_subscribers || config.defaultCampaignTarget, 10),
          branchId: branch_id ? parseInt(branch_id, 10) : null,
          startDate: new Date(),
          isActive: true,
        },
      });
      res.json(row);
    } catch (e) { next(e); }
  });

  app.patch('/admin/campaigns/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const data = {};
      const fieldMap = {
        name: 'name',
        description: 'description',
        template_requirements: 'templateRequirements',
        target_subscribers: 'targetSubscribers',
        branch_id: 'branchId',
        is_active: 'isActive',
        end_date: 'endDate',
      };
      for (const [k, prismaField] of Object.entries(fieldMap)) {
        if (k in req.body) {
          let v = req.body[k];
          if (k === 'target_subscribers' || k === 'branch_id') v = v == null ? null : parseInt(v, 10);
          if (k === 'is_active') v = !!v;
          if (k === 'end_date') v = v ? new Date(v) : null;
          data[prismaField] = v;
        }
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'no fields' });
      const row = await prisma.campaign.update({ where: { id }, data });
      res.json(row);
    } catch (e) { next(e); }
  });

  // ─────────── Submissions ───────────

  app.get('/admin/submissions', async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
      const code = req.query.campaign_code;
      const where = code ? { campaign: { code: String(code).toUpperCase() } } : {};
      const rows = await prisma.submission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        take: limit,
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  // ─────────── Daily reports ───────────

  app.get('/admin/daily-reports', async (req, res, next) => {
    try {
      const code = req.query.campaign_code;
      const date = req.query.report_date;
      const where = {};
      if (code) where.campaign = { code: String(code).toUpperCase() };
      if (date) where.reportDate = new Date(`${date}T00:00:00`);
      const rows = await prisma.dailyReport.findMany({
        where,
        orderBy: { reportDate: 'desc' },
      });
      res.json(rows);
    } catch (e) { next(e); }
  });

  app.use((err, _req, res, _next) => {
    logger.error({ err: err.message }, 'admin route error');
    res.status(400).json({ error: err.message });
  });

  return app;
}
