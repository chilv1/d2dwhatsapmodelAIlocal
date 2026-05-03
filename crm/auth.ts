/**
 * Full NextAuth setup — Node runtime only (import Prisma + bcrypt).
 * Server components, route handlers, server actions import từ đây.
 * Middleware/proxy KHÔNG được import — dùng auth.config.ts.
 */
import NextAuth, { type DefaultSession } from 'next-auth';
import 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import authConfig from './auth.config';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      branchId: number | null;
    } & DefaultSession['user'];
  }

  interface User {
    role: string;
    branchId: number | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    branchId: number | null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mật khẩu', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || '').trim().toLowerCase();
        const password = String(credentials?.password || '');
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {});

        // Audit log (fail-soft)
        audit({
          userId: user.id,
          action: 'user.login',
          entityType: 'user',
          entityId: user.id,
          newValue: { email: user.email },
        }).catch(() => {});

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          branchId: user.branchId,
        };
      },
    }),
  ],
});
