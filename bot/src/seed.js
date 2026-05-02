/**
 * Seed dữ liệu demo: 3 chi nhánh + 1 team leader + 1 campaign demo.
 * Idempotent: chạy nhiều lần không tạo trùng (dùng upsert theo unique field).
 * Chạy: npm run bot:seed (từ root) hoặc npm run seed (từ bot/)
 */
import { prisma, disconnectDb } from './db.js';
import { logger } from './logger.js';

async function main() {
  // Branches (upsert theo code)
  const branches = [
    { code: 'LIMA', name: 'Sucursal Lima', region: 'Lima Metropolitana' },
    { code: 'AREQUIPA', name: 'Sucursal Arequipa', region: 'Arequipa' },
    { code: 'CUSCO', name: 'Sucursal Cusco', region: 'Cusco' },
  ];
  for (const b of branches) {
    await prisma.branch.upsert({
      where: { code: b.code },
      update: { name: b.name, region: b.region },
      create: b,
    });
  }
  const lima = await prisma.branch.findUniqueOrThrow({ where: { code: 'LIMA' } });

  // Team leader demo
  await prisma.teamLeader.upsert({
    where: { whatsappNumber: '51999000001@c.us' },
    update: {},
    create: {
      name: 'Carlos Pérez',
      whatsappNumber: '51999000001@c.us',
      branchId: lima.id,
    },
  });

  // Campaign demo
  await prisma.campaign.upsert({
    where: { code: 'PROMO_LIMA_001' },
    update: {},
    create: {
      code: 'PROMO_LIMA_001',
      name: 'Promoción Plan Postpago Marzo',
      description: 'Khuyến mãi gói trả sau tháng 3 tại Lima',
      templateRequirements:
        'Banner màu đỏ Telecom Big rộng tối thiểu 2m, đặt phía trước điểm bán DF. ' +
        'Promotor mặc áo đỏ đồng phục, đứng cạnh banner. ' +
        'Bàn tư vấn có brochure xếp gọn, máy POS sẵn sàng.',
      targetSubscribers: 20,
      branchId: lima.id,
      startDate: new Date(),
      isActive: true,
    },
  });

  const counts = {
    branches: await prisma.branch.count(),
    teamLeaders: await prisma.teamLeader.count(),
    campaigns: await prisma.campaign.count(),
    submissions: await prisma.submission.count(),
    dailyReports: await prisma.dailyReport.count(),
    users: await prisma.user.count(),
  };

  logger.info({ counts }, '✓ Seed xong');
  console.log('\n=== Seed result ===');
  console.log(counts);
  console.log(
    '\n⚠ Campaign PROMO_LIMA_001 chưa có ảnh template.\n' +
      'Upload qua: POST /admin/campaigns (multipart, field "template_image", header "x-api-key")\n',
  );
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb();
  });
