/**
 * Seed 3 promotor demo + assign vài submission có sẵn cho promotor
 * để test KPI ranking trong Reports page.
 */
import { PrismaClient } from '@prisma/client';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
process.env.DATABASE_URL = `file:${PROJECT_ROOT}/data/telecombig.db`;

const prisma = new PrismaClient();

async function main() {
  const lima = await prisma.branch.findUnique({ where: { code: 'LIMA' } });
  const arequipa = await prisma.branch.findUnique({ where: { code: 'AREQUIPA' } });
  if (!lima || !arequipa) throw new Error('Branches not seeded');

  const data = [
    { name: 'José Ramírez', employeeCode: 'EMP_LIMA_001', branchId: lima.id },
    { name: 'María Fernández', employeeCode: 'EMP_LIMA_002', branchId: lima.id },
    { name: 'Diego Castro', employeeCode: 'EMP_AQP_001', branchId: arequipa.id },
  ];

  for (const p of data) {
    await prisma.promotor.upsert({
      where: { employeeCode: p.employeeCode },
      update: { isActive: true, name: p.name, branchId: p.branchId },
      create: { ...p, isActive: true },
    });
    console.log(`✓ ${p.employeeCode} — ${p.name}`);
  }

  // Assign existing submissions với promotor (round-robin)
  const promotors = await prisma.promotor.findMany({
    orderBy: { id: 'asc' },
    where: { branchId: lima.id },
  });
  const submissions = await prisma.submission.findMany({
    where: { campaign: { branchId: lima.id }, promotorId: null },
    orderBy: { id: 'asc' },
  });

  for (let i = 0; i < submissions.length && promotors.length > 0; i++) {
    const p = promotors[i % promotors.length];
    await prisma.submission.update({
      where: { id: submissions[i].id },
      data: { promotorId: p.id },
    });
  }

  console.log(`\n✓ Seeded ${data.length} promotors`);
  console.log(`✓ Linked ${submissions.length} submissions to promotors`);
  console.log(`Total promotors: ${await prisma.promotor.count()}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
