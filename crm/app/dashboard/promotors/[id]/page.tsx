/**
 * Promotor detail + edit + recent submissions của promotor.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireRole, type Role } from '@/lib/rbac';
import { formatDate, formatDateTimeShort } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ResultBadge, SubmissionTypeBadge } from '@/components/result-badge';
import { ArrowLeft } from 'lucide-react';
import { updatePromotorAction } from '@/lib/actions/promotor';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function PromotorDetailPage({ params }: { params: Params }) {
  const session = await requireRole(['admin', 'branch_manager']);
  const role = session.user.role as Role;
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const promotor = await prisma.promotor.findUnique({
    where: { id },
    include: { branch: true },
  });
  if (!promotor) notFound();

  // Branch scope check
  if (
    role === 'branch_manager' &&
    promotor.branchId !== session.user.branchId
  ) {
    notFound();
  }

  const branches = await prisma.branch.findMany({
    where:
      role === 'branch_manager' && session.user.branchId
        ? { id: session.user.branchId }
        : undefined,
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  const [submissions, totalCount, approvedCount] = await Promise.all([
    prisma.submission.findMany({
      where: { promotorId: id },
      orderBy: { submittedAt: 'desc' },
      take: 20,
      include: { campaign: { select: { code: true, name: true } } },
    }),
    prisma.submission.count({ where: { promotorId: id } }),
    prisma.submission.count({
      where: { promotorId: id, evaluationResult: 'approved' },
    }),
  ]);

  const approvalRate = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/promotors">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{promotor.name}</h1>
            {promotor.isActive ? (
              <Badge variant="success">Hoạt động</Badge>
            ) : (
              <Badge variant="secondary">Vô hiệu</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Mã NV: <span className="font-mono">{promotor.employeeCode}</span>
            {promotor.branch && (
              <> · Chi nhánh: {promotor.branch.code} — {promotor.branch.name}</>
            )}
            <> · Vào làm: {formatDate(promotor.joinedAt)}</>
          </p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Tổng submissions
            </div>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Đã đạt
            </div>
            <CardTitle className="text-3xl">{approvedCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Tỉ lệ đạt
            </div>
            <CardTitle className="text-3xl">{approvalRate.toFixed(0)}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cập nhật thông tin</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updatePromotorAction} className="space-y-4">
            <input type="hidden" name="id" value={promotor.id} />
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Họ tên</Label>
                <Input id="name" name="name" defaultValue={promotor.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_id">Chi nhánh</Label>
                <Select
                  id="branch_id"
                  name="branch_id"
                  defaultValue={promotor.branchId ? String(promotor.branchId) : ''}
                >
                  {role === 'admin' && <option value="">— Không gán —</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Lưu thay đổi</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submissions gần đây</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Chưa có submission nào được link.
                  </TableCell>
                </TableRow>
              )}
              {submissions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{formatDateTimeShort(s.submittedAt)}</TableCell>
                  <TableCell className="font-mono text-sm">{s.campaign?.code || '—'}</TableCell>
                  <TableCell><SubmissionTypeBadge type={s.submissionType} /></TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {s.similarityScore ?? '—'}
                  </TableCell>
                  <TableCell><ResultBadge result={s.evaluationResult} /></TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/submissions/${s.id}`}>Xem</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
