/**
 * Login page — credentials form, dùng signIn() server action từ NextAuth.
 */
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { auth, signIn } from '@/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ callbackUrl?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = params.callbackUrl || '/dashboard';

  // Đã login → redirect về callback
  if (session?.user) redirect(callbackUrl);

  const errorMsg =
    params.error === 'CredentialsSignin'
      ? 'Email hoặc mật khẩu không đúng.'
      : params.error
        ? `Lỗi đăng nhập: ${params.error}`
        : '';

  async function loginAction(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: callbackUrl,
      });
    } catch (error) {
      // AuthError = credentials sai → redirect login + error param
      if (error instanceof AuthError) {
        redirect(
          `/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
      }
      // Re-throw redirect (NEXT_REDIRECT) hoặc lỗi khác
      throw error;
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 via-white to-orange-50">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold mb-2">
            TB
          </div>
          <CardTitle>Telecom Big — CRM</CardTitle>
          <CardDescription>
            Đăng nhập vào hệ thống quản lý campaign
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={loginAction} className="space-y-4">
            {errorMsg && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive border border-destructive/20">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="admin@telecombig.pe"
                defaultValue="admin@telecombig.pe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" className="w-full" size="lg">
              Đăng nhập
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Tài khoản mặc định: <code className="font-mono">admin@telecombig.pe</code> /{' '}
            <code className="font-mono">admin123</code>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
