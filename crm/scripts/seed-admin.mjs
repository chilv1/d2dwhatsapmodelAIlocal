/**
 * Seed admin user — chạy 1 lần để tạo tài khoản đăng nhập đầu tiên cho CRM.
 * Idempotent: chạy nhiều lần không tạo trùng (upsert theo email).
 *
 * Chạy: npm run crm:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
process.env.DATABASE_URL = `file:${PROJECT_ROOT}/data/telecombig.db`;

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || 'admin@telecombig.pe';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'admin123';
const ADMIN_NAME = process.env.ADMIN_SEED_NAME || 'Administrador';

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      // Chỉ update nếu chưa active (không đè password nếu user đã đổi)
      isActive: true,
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: 'admin',
      isActive: true,
    },
  });

  console.log('✓ Admin user ready:');
  console.log(`  Email:    ${user.email}`);
  console.log(`  Name:     ${user.name}`);
  console.log(`  Role:     ${user.role}`);
  console.log(`  Password: ${ADMIN_PASSWORD}  (đổi sau lần đăng nhập đầu)`);
  console.log();
  console.log(`  Total users: ${await prisma.user.count()}`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
