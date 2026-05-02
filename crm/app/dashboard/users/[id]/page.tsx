/**
 * User edit page — admin only.
 * Cho phép sửa name/role/branch + reset password.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireRole, ROLE_LABELS, ROLES } from '@/lib/rbac';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { updateUserAction, resetPasswordAction } from '@/lib/actions/user';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function UserEditPage({ params }: { params: Params }) {
  await requireRole(['admin']);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const [user, branches] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { branch: { select: { code: true, name: true } } },
    }),
    prisma.branch.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);
  if (!user) notFound();

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
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold tracking-tight">{user.name}</h1>
          {user.isActive ? (
            <Badge variant="success">Hoạt động</Badge>
          ) : (
            <Badge variant="secondary">Vô hiệu</Badge>
          )}
        </div>
        <p className="text-muted-foreground font-mono text-sm">{user.email}</p>
        {user.lastLoginAt && (
          <p className="text-xs text-muted-foreground mt-1">
            Đăng nhập gần nhất: {formatDateTime(user.lastLoginAt)}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin cơ bản</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateUserAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />

            <div className="space-y-2">
              <Label htmlFor="name">Tên hiển thị</Label>
              <Input id="name" name="name" defaultValue={user.name} required />
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select id="role" name="role" defaultValue={user.role}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_id">Chi nhánh (cho branch_manager)</Label>
                <Select
                  id="branch_id"
                  name="branch_id"
                  defaultValue={user.branchId ? String(user.branchId) : ''}
                >
                  <option value="">— Không gán —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit">Lưu thay đổi</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đặt lại mật khẩu</CardTitle>
          <CardDescription>
            Đặt mật khẩu mới cho user. User sẽ phải dùng mật khẩu này để đăng nhập tiếp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={resetPasswordAction} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu mới</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={6}
                required
                placeholder="≥ 6 ký tự"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="destructive">
                Đặt lại mật khẩu
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
