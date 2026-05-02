/**
 * Audit log timeline — admin only.
 * Hiển thị mọi action được ghi vào audit_logs với filter user/action.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { actionLabel } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

const ACTION_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary'> = {
  'user.login': 'info',
  'user.create': 'success',
  'user.update': 'warning',
  'user.deactivate': 'destructive',
  'user.reactivate': 'success',
  'user.password_reset': 'warning',
  'campaign.create': 'success',
  'campaign.update': 'warning',
  'campaign.toggle_active': 'warning',
  'submission.override': 'destructive',
};

type SearchParams = Promise<{
  page?: string;
  user?: string;
  action?: string;
}>;

function buildUrl(base: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(['admin']);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10));

  const where: Record<string, unknown> = {};
  if (params.user) where.userId = parseInt(params.user, 10);
  if (params.action) where.action = params.action;

  const [items, total, users, distinctActions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { id: 'asc' },
    }),
    prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground mt-1">
          Lịch sử mọi thao tác trong hệ thống ({total} entries)
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <Select name="user" defaultValue={params.user || ''}>
              <option value="">Tất cả user</option>
              {users.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name} ({u.email})
                </option>
              ))}
            </Select>

            <Select name="action" defaultValue={params.action || ''}>
              <option value="">Tất cả action</option>
              {distinctActions.map((a) => (
                <option key={a.action} value={a.action}>
                  {actionLabel(a.action)} — {a.action}
                </option>
              ))}
            </Select>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Lọc</Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/audit">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Thời gian</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Thay đổi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    Chưa có audit log nào.
                  </TableCell>
                </TableRow>
              )}
              {items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell className="text-sm">
                    {log.user ? (
                      <span title={log.user.email}>{log.user.name}</span>
                    ) : (
                      <span className="text-muted-foreground italic">system</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANT[log.action] || 'secondary'}>
                      {actionLabel(log.action)}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      {log.action}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {log.entityType ? (
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {log.entityType}#{log.entityId}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(log.oldValue || log.newValue) ? (
                      <details className="cursor-pointer">
                        <summary className="text-muted-foreground hover:text-foreground">
                          Xem diff
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {log.oldValue && (
                            <div>
                              <div className="text-destructive font-medium text-[10px] uppercase">
                                Trước
                              </div>
                              <pre className="bg-destructive/5 p-2 rounded text-xs overflow-auto max-w-md">
                                {JSON.stringify(JSON.parse(log.oldValue), null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.newValue && (
                            <div>
                              <div className="text-emerald-700 font-medium text-[10px] uppercase">
                                Sau
                              </div>
                              <pre className="bg-emerald-50 p-2 rounded text-xs overflow-auto max-w-md">
                                {JSON.stringify(JSON.parse(log.newValue), null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Trang {page} / {totalPages} ({total} logs)
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                <Link href={buildUrl('/dashboard/audit', { ...params, page: String(page - 1) })}>
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
                <Link href={buildUrl('/dashboard/audit', { ...params, page: String(page + 1) })}>
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
