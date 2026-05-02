/**
 * Edge-safe NextAuth config — KHÔNG import Prisma/bcrypt (chỉ chạy trong Node).
 * File này được middleware/proxy import vì middleware chạy ở edge runtime.
 *
 * Providers thật (Credentials với DB lookup) được khai báo trong auth.ts (Node-only).
 */
import type { NextAuthConfig } from 'next-auth';

export default {
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [],   // điền trong auth.ts
  callbacks: {
    /**
     * Authorization check chạy trong middleware (edge).
     * Chặn truy cập dashboard nếu chưa login.
     */
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isPublicPath =
        path.startsWith('/login') ||
        path.startsWith('/api/auth') ||
        path.startsWith('/api/cron') ||  // Cron endpoint dùng ?key= riêng
        path === '/';
      if (isPublicPath) return true;
      return isLoggedIn;
    },
    /**
     * JWT + session callbacks (chạy trong edge cũng OK vì không touch DB).
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role || 'viewer';
        token.branchId = (user as { branchId?: number | null }).branchId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.branchId = token.branchId as number | null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
