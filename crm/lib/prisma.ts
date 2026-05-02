/**
 * Prisma Client singleton cho Next.js.
 * Tránh re-create client mỗi khi hot-reload trong dev (memory leak + connection exhaust).
 *
 * Schema dùng chung từ /prisma/schema.prisma (root level).
 * DB path resolve từ process.cwd() khi Next.js chạy thì cwd = root project.
 */
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

// Khi chạy `npm run crm:dev` từ root → process.cwd() = /Users/chilevan/Desktop/CTYAI
// Khi chạy `npm run dev` từ crm/ → process.cwd() = .../crm/ → cần đi lên 1 cấp
function resolveDbPath(): string {
  const cwd = process.cwd();
  // Nếu cwd = root (có folder data/), dùng nó. Nếu cwd = crm/, đi lên.
  const rootGuess = cwd.endsWith('/crm') ? resolve(cwd, '..') : cwd;
  return resolve(rootGuess, 'data', 'telecombig.db');
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${resolveDbPath()}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
