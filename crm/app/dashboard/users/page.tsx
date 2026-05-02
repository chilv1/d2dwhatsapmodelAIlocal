/**
 * Users management — admin only.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireRole, ROLE_LABELS, type Role } from '@/lib/rbac';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Power } from 'lucide-react';
import { toggleUserActiveAction } from '@/lib/actions/user';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requireRole(['admin']);
  const adminId = parseInt(session.user.id, 10);

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
    include: { branch: { select: { code: true, name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users + RBAC</h1>
          <p className="text-muted-foreground mt-1">
            Quản lý tài khoản và phân quyền ({users.length} user)
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/users/new">
            <Plus className="h-4 w-4" />
            Tạo user mới
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">ID</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead>Lần đăng nhập gần nhất</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right w-[160px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === adminId;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">#{u.id}</TableCell>
                    <TableCell className="font-mono text-sm">{u.email}</TableCell>
                    <TableCell>
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">(bạn)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          u.role === 'admin'
                            ? 'default'
                            : u.role === 'branch_manager'
                              ? 'info'
                              : 'secondary'
                        }
                      >
                        {ROLE_LABELS[u.role as Role] || u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.branch ? `${u.branch.code} — ${u.branch.name}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(u.lastLoginAt)}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="success">Hoạt động</Badge>
                      ) : (
                        <Badge variant="secondary">Vô hiệu</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {!isSelf && (
                          <form action={toggleUserActiveAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              title={u.isActive ? 'Vô hiệu hoá' : 'Kích hoạt'}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/users/${u.id}`}>Sửa</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
