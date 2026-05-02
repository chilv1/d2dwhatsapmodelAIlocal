/**
 * User create form — admin only.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireRole, ROLE_LABELS, ROLES } from '@/lib/rbac';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { createUserAction } from '@/lib/actions/user';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  await requireRole(['admin']);
  const branches = await prisma.branch.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/users">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tạo user mới</h1>
        <p className="text-muted-foreground mt-1">
          Cấp quyền truy cập CRM cho thành viên mới.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin tài khoản</CardTitle>
          <CardDescription>
            <strong>Admin</strong> = full access · <strong>Branch manager</strong> = chỉ chi nhánh mình ·{' '}
            <strong>Viewer</strong> = read-only mọi data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createUserAction} className="space-y-5">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="user@telecombig.pe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Tên hiển thị *</Label>
                <Input id="name" name="name" required placeholder="Carlos Pérez" />
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select id="role" name="role" defaultValue="viewer" required>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_id">Chi nhánh (cho branch_manager)</Label>
                <Select id="branch_id" name="branch_id">
                  <option value="">— Không gán —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu khởi tạo *</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={6}
                required
                placeholder="≥ 6 ký tự"
              />
              <p className="text-xs text-muted-foreground">
                User có thể đổi mật khẩu sau khi đăng nhập.
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" asChild variant="outline">
                <Link href="/dashboard/users">Huỷ</Link>
              </Button>
              <Button type="submit">Tạo user</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
