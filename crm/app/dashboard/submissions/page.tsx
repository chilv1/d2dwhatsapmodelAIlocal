/**
 * Submissions list — filter + pagination, đọc trực tiếp từ Prisma.
 * URL search params: ?page=1&campaign=PROMO_LIMA_001&result=approved&type=campaign_start
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDateTimeShort, gpsLink } from '@/lib/format';
import { requireSession, submissionScopeWhere } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ResultBadge, SubmissionTypeBadge } from '@/components/result-badge';
import { DeleteSubmissionButton } from '@/components/delete-submission-button';
import { deleteSubmissionAction } from '@/lib/actions/submission';
import { type Role } from '@/lib/rbac';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  page?: string;
  campaign?: string;
  branch?: string;
  result?: string;
  type?: string;
}>;

async function loadFilters() {
  const [campaigns, branches] = await Promise.all([
    prisma.campaign.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.branch.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
  ]);
  return { campaigns, branches };
}

async function loadSubmissions(
  params: Awaited<SearchParams>,
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const skip = (page - 1) * PAGE_SIZE;

  // Branch scoping: branch_manager chỉ thấy data branch mình
  const scopeWhere = submissionScopeWhere(session);
  const where: Record<string, unknown> = { ...scopeWhere };
  if (params.campaign) where.campaign = { code: params.campaign.toUpperCase() };
  if (params.result) where.evaluationResult = params.result;
  if (params.type) where.submissionType = params.type;
  if (params.branch) {
    where.campaign = {
      ...(where.campaign as object),
      branchId: parseInt(params.branch, 10),
    };
  }

  const [items, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: {
        campaign: { select: { code: true, name: true } },
        teamLeader: { select: { name: true } },
      },
    }),
    prisma.submission.count({ where }),
  ]);

  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

function buildUrl(base: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const role = session.user.role as Role;
  const isAdmin = role === 'admin';
  const params = await searchParams;
  const { items, total, page, totalPages } = await loadSubmissions(params, session);
  const { campaigns, branches } = await loadFilters();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Submissions</h1>
          <p className="text-muted-foreground mt-1">
            Tất cả ảnh team leader gửi qua WhatsApp ({total} kết quả)
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            <Select name="campaign" defaultValue={params.campaign || ''}>
              <option value="">Tất cả campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>

            <Select name="branch" defaultValue={params.branch || ''}>
              <option value="">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>

            <Select name="result" defaultValue={params.result || ''}>
              <option value="">Tất cả kết quả</option>
              <option value="approved">Đạt</option>
              <option value="rejected">Không đạt</option>
              <option value="needs_review">Cần xem</option>
              <option value="pending">Đang chờ</option>
            </Select>

            <Select name="type" defaultValue={params.type || ''}>
              <option value="">Tất cả loại</option>
              <option value="campaign_start">Đầu ngày</option>
              <option value="campaign_end">Cuối ngày</option>
            </Select>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Lọc
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/submissions">Reset</Link>
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
                <TableHead className="w-[60px]">ID</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead>Người gửi</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className="text-right">Subs</TableHead>
                <TableHead className="w-[80px]">GPS</TableHead>
                <TableHead className="text-right w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    Chưa có submission nào khớp bộ lọc.
                  </TableCell>
                </TableRow>
              )}
              {items.map((s) => {
                const map = gpsLink(s.gpsLatitude, s.gpsLongitude);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">#{s.id}</TableCell>
                    <TableCell className="text-sm">
                      {formatDateTimeShort(s.submittedAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.waSenderName || s.teamLeader?.name || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {s.campaign?.code || (
                          <span className="text-muted-foreground italic">no match</span>
                        )}
                      </div>
                      {s.campaign?.name && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {s.campaign.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <SubmissionTypeBadge type={s.submissionType} />
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {s.similarityScore ?? '—'}
                    </TableCell>
                    <TableCell>
                      <ResultBadge result={s.evaluationResult} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {s.reportedSubscribers ?? '—'}
                    </TableCell>
                    <TableCell>
                      {map ? (
                        <a
                          href={map}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center"
                        >
                          <MapPin className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1.5 justify-end">
                        {isAdmin && (
                          <DeleteSubmissionButton
                            id={s.id}
                            action={deleteSubmissionAction}
                            variant="icon"
                          />
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/submissions/${s.id}`}>Xem</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Trang {page} / {totalPages} ({total} submissions)
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                <Link
                  href={buildUrl('/dashboard/submissions', {
                    ...params,
                    page: String(page - 1),
                  })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
                <Link
                  href={buildUrl('/dashboard/submissions', {
                    ...params,
                    page: String(page + 1),
                  })}
                >
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
