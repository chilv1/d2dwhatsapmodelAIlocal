/**
 * Seed dữ liệu demo: 3 chi nhánh + 1 team leader + 1 campaign (chưa có template).
 * Chạy: npm run seed
 */
import { db } from './db.js';
import { logger } from './logger.js';

function seed() {
  // Branches
  const branches = [
    { code: 'LIMA', name: 'Sucursal Lima', region: 'Lima Metropolitana' },
    { code: 'AREQUIPA', name: 'Sucursal Arequipa', region: 'Arequipa' },
    { code: 'CUSCO', name: 'Sucursal Cusco', region: 'Cusco' },
  ];

  const insertBranch = db.prepare(
    'INSERT OR IGNORE INTO branches (code, name, region) VALUES (?, ?, ?)',
  );
  for (const b of branches) insertBranch.run(b.code, b.name, b.region);

  const lima = db.prepare('SELECT * FROM branches WHERE code = ?').get('LIMA');

  // Team leader demo
  db.prepare(
    `INSERT OR IGNORE INTO team_leaders (name, whatsapp_number, branch_id)
     VALUES (?, ?, ?)`,
  ).run('Carlos Pérez', '51999000001@c.us', lima.id);

  // Campaign demo (chưa có template — phải upload qua admin API)
  db.prepare(
    `INSERT OR IGNORE INTO campaigns
       (code, name, description, template_requirements, target_subscribers,
        branch_id, start_date, is_active)
     VALUES (?, ?, ?, ?, ?, ?, date('now'), 1)`,
  ).run(
    'PROMO_LIMA_001',
    'Promoción Plan Postpago Marzo',
    'Khuyến mãi gói trả sau tháng 3 tại Lima',
    'Banner màu đỏ Telecom Big rộng tối thiểu 2m, đặt phía trước điểm bán DF. ' +
      'Promotor mặc áo đỏ đồng phục, đứng cạnh banner. ' +
      'Bàn tư vấn có brochure xếp gọn, máy POS sẵn sàng.',
    20,
    lima.id,
  );

  const counts = {
    branches: db.prepare('SELECT COUNT(*) AS c FROM branches').get().c,
    team_leaders: db.prepare('SELECT COUNT(*) AS c FROM team_leaders').get().c,
    campaigns: db.prepare('SELECT COUNT(*) AS c FROM campaigns').get().c,
  };

  logger.info({ counts }, '✓ Seed xong');
  console.log('\n=== Seed result ===');
  console.log(counts);
  console.log(
    '\n⚠ Campaign PROMO_LIMA_001 chưa có ảnh template.\n' +
      'Upload bằng: POST http://localhost:3000/admin/campaigns ' +
      "(field 'template_image', header 'x-api-key')\n",
  );
}

seed();
