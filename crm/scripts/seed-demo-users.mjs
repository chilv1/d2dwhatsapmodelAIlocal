/**
 * Seed thêm 2 user demo cho M4 testing.
 *   - manager.lima@telecombig.pe / manager123 (branch_manager scoped Lima)
 *   - viewer@telecombig.pe / viewer123 (read-only)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
process.env.DATABASE_URL = `file:${PROJECT_ROOT}/data/telecombig.db`;

const prisma = new PrismaClient();

async function main() {
  const lima = await prisma.branch.findUnique({ where: { code: 'LIMA' } });
  if (!lima) throw new Error('Branch LIMA not found - run npm run bot:seed first');

  const users = [
    {
      email: 'manager.lima@telecombig.pe',
      name: 'Manager Lima',
      role: 'branch_manager',
      branchId: lima.id,
      password: 'manager123',
    },
    {
      email: 'viewer@telecombig.pe',
      name: 'Viewer Demo',
      role: 'viewer',
      branchId: null,
      password: 'viewer123',
    },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { isActive: true, role: u.role, branchId: u.branchId, name: u.name },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        branchId: u.branchId,
        passwordHash: hash,
        isActive: true,
      },
    });
    console.log(`✓ ${u.email} / ${u.password} (${u.role})`);
  }

  console.log(`\nTotal users: ${await prisma.user.count()}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
