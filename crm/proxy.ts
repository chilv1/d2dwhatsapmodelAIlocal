/**
 * Auth proxy (Next.js 16 — đổi tên từ middleware) — chặn truy cập vào
 * route bảo vệ nếu chưa login. Dùng `authConfig` (edge-safe), KHÔNG
 * import auth.ts (Node-only) để tránh load Prisma trong edge runtime.
 *
 * Logic chặn nằm trong authConfig.callbacks.authorized.
 */
import NextAuth from 'next-auth';
import authConfig from './auth.config';

export const { auth: proxy } = NextAuth(authConfig);

export default proxy(() => {
  // authorized callback đã quyết định cho phép hay redirect
  // Trả về undefined để dùng default behavior từ Auth.js
  return undefined;
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
