/**
 * Promotors list — KPI per promotor: # submissions, % approved, last activity.
 * Branch_manager scoped tới chi nhánh mình.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireSession, canWrite, type Role } from '@/lib/rbac';
import { formatDateTimeShort } from '@/lib/format';
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
import { Plus, Power, TrendingUp } from 'lucide-react';
import { togglePromotorActiveAction } from '@/lib/actions/promotor';

export const dynamic = 'force-dynamic';

export default async function PromotorsPage() {
  const session = await requireSession();
  const role = session.user.role as Role;
  const writable = canWrite(session);

  const branchScope =
    role === 'branch_manager' ? { branchId: session.user.branchId ?? -1 } : {};

  // Lấy promotors với count submissions + approved count
  const promotors = await prisma.promotor.findMany({
    where: branchScope,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      branch: { select: { code: true, name: true } },
    },
  });

  // Aggregation: submissions per promotor (raw query để gọn)
  const stats = await prisma.submission.groupBy({
    by: ['promotorId'],
    _count: { _all: true },
    where: { promotorId: { not: null } },
  });

  const approvedStats = await prisma.submission.groupBy({
    by: ['promotorId'],
    _count: { _all: true },
    where: { promotorId: { not: null }, evaluationResult: 'approved' },
  });

  const lastActivity = await prisma.submission.groupBy({
    by: ['promotorId'],
    _max: { submittedAt: true },
    where: { promotorId: { not: null } },
  });

  const statsMap = new Map(stats.map((s) => [s.promotorId, s._count._all]));
  const approvedMap = new Map(
    approvedStats.map((s) => [s.promotorId, s._count._all]),
  );
  const lastMap = new Map(
    lastActivity.map((s) => [s.promotorId, s._max.submittedAt]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-7 w-7" />
            Promotors
          </h1>
          <p className="text-muted-foreground mt-1">
            Nhân viên thực địa và KPI ({promotors.length} promotor)
          </p>
        </div>
        {writable && (
          <Button asChild>
            <Link href="/dashboard/promotors/new">
              <Plus className="h-4 w-4" />
              Thêm promotor
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã NV</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead className="text-right">Đạt</TableHead>
                <TableHead className="text-right">Tỉ lệ đạt</TableHead>
                <TableHead>Hoạt động gần nhất</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right w-[160px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promotors.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-12 text-muted-foreground"
                  >
                    Chưa có promotor nào.
                    {writable && (
                      <>
                        {' '}
                        <Link
                          href="/dashboard/promotors/new"
                          className="text-primary hover:underline"
                        >
                          Thêm mới
                        </Link>
                        .
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {promotors.map((p) => {
                const total = statsMap.get(p.id) ?? 0;
                const approved = approvedMap.get(p.id) ?? 0;
                const rate = total > 0 ? (approved / total) * 100 : 0;
                const last = lastMap.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">
                      {p.employeeCode}
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm">
                      {p.branch
                        ? `${p.branch.code} — ${p.branch.name}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{total}</TableCell>
                    <TableCell className="text-right font-mono">{approved}</TableCell>
                    <TableCell className="text-right font-mono">
                      {total > 0 ? (
                        <Badge variant={rate >= 70 ? 'success' : rate >= 50 ? 'warning' : 'destructive'}>
                          {rate.toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {last ? formatDateTimeShort(last) : '—'}
                    </TableCell>
                    <TableCell>
                      {p.isActive ? (
                        <Badge variant="success">Hoạt động</Badge>
                      ) : (
                        <Badge variant="secondary">Vô hiệu</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {writable && (
                          <form action={togglePromotorActiveAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <Button type="submit" size="sm" variant="ghost"
                              title={p.isActive ? 'Vô hiệu hoá' : 'Kích hoạt'}>
                              <Power className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/promotors/${p.id}`}>Xem</Link>
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
