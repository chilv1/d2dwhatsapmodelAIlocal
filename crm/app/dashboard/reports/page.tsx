/**
 * Reports page — chart 7/30 ngày + ranking + Excel export buttons.
 * Date range qua search params ?days=7|30
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import {
  requireSession,
  submissionScopeWhere,
  type Role,
} from '@/lib/rbac';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  DailyAchievementChart,
  SubmissionStatusChart,
  BranchKpiChart,
  type DailyAchievementPoint,
  type SubmissionStatusBucket,
  type BranchKpi,
} from '@/components/charts';
import { FileSpreadsheet, BarChart3, Download, Send, Map as MapIcon, Clock } from 'lucide-react';
import { sendDigestNowAction } from '@/lib/actions/notification';
import { channelStatus } from '@/lib/notify/dispatcher';
import { SubmissionsHeatmap } from '@/components/submissions-heatmap';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ days?: string }>;

// ⭐ Local date YYYY-MM-DD (timezone của OS server) — không dùng UTC để tránh
// submissions cuối ngày Lima (UTC-5) bị nhảy sang ngày kế.
function localDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function genDates(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(localDateKey(d));
  }
  return out;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession();
  const role = session.user.role as Role;
  const params = await searchParams;
  const days = parseInt(params.days || '30', 10);
  const range = [7, 30].includes(days) ? days : 30;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - range + 1);
  fromDate.setHours(0, 0, 0, 0);

  const subScope = submissionScopeWhere(session);
  const reportScope =
    role === 'branch_manager'
      ? { campaign: { branchId: session.user.branchId ?? -1 } }
      : {};

  // 1. Daily achievement timeseries
  const reports = await prisma.dailyReport.findMany({
    where: { ...reportScope, reportDate: { gte: fromDate } },
    orderBy: { reportDate: 'asc' },
  });

  const datesArr = genDates(range);
  // Aggregate per date (sum across campaigns)
  const dailyMap = new Map<string, { actual: number; target: number; achieved: number }>();
  for (const d of datesArr) {
    dailyMap.set(d, { actual: 0, target: 0, achieved: 0 });
  }
  for (const r of reports) {
    const key = localDateKey(r.reportDate);
    const cur = dailyMap.get(key);
    if (cur) {
      cur.actual += r.actualSubscribers;
      cur.target += r.targetSubscribers;
      cur.achieved += r.achieved ? 1 : 0;
    }
  }
  const dailyChart: DailyAchievementPoint[] = datesArr.map((d) => ({
    date: d.slice(5),
    ...dailyMap.get(d)!,
  }));

  // 2. Submissions by status (last N days)
  const submissionsRange = await prisma.submission.findMany({
    where: { ...subScope, submittedAt: { gte: fromDate } },
    select: { submittedAt: true, evaluationResult: true },
  });
  const statusMap = new Map<string, SubmissionStatusBucket>();
  for (const d of datesArr) {
    statusMap.set(d, { date: d.slice(5), approved: 0, rejected: 0, needs_review: 0 });
  }
  for (const s of submissionsRange) {
    const key = localDateKey(s.submittedAt);
    const cur = statusMap.get(key);
    if (cur) {
      if (s.evaluationResult === 'approved') cur.approved += 1;
      else if (s.evaluationResult === 'rejected') cur.rejected += 1;
      else cur.needs_review += 1;
    }
  }
  const statusChart: SubmissionStatusBucket[] = datesArr.map((d) => statusMap.get(d)!);

  // 3. Branch KPI (admin only)
  let branchKpi: BranchKpi[] = [];
  if (role !== 'branch_manager') {
    const branches = await prisma.branch.findMany();
    for (const b of branches) {
      const total = await prisma.submission.count({
        where: { campaign: { branchId: b.id }, submittedAt: { gte: fromDate } },
      });
      const approved = await prisma.submission.count({
        where: {
          campaign: { branchId: b.id },
          submittedAt: { gte: fromDate },
          evaluationResult: 'approved',
        },
      });
      branchKpi.push({
        branch: b.code,
        total,
        approved,
        rate: total > 0 ? Math.round((approved / total) * 100) : 0,
      });
    }
    branchKpi = branchKpi.sort((a, b) => b.rate - a.rate);
  }

  // 4. Top promotors (top 10)
  const topPromotors = await prisma.promotor.findMany({
    where:
      role === 'branch_manager' ? { branchId: session.user.branchId ?? -1 } : undefined,
    include: {
      branch: { select: { code: true } },
      _count: {
        select: {
          submissions: {
            where: { submittedAt: { gte: fromDate } },
          },
        },
      },
    },
  });

  // Get approved counts per promotor for the range
  const promotorApprovedCounts = await prisma.submission.groupBy({
    by: ['promotorId'],
    _count: { _all: true },
    where: {
      promotorId: { not: null },
      submittedAt: { gte: fromDate },
      evaluationResult: 'approved',
    },
  });
  const approvedCountMap = new Map(
    promotorApprovedCounts.map((p) => [p.promotorId, p._count._all]),
  );

  const ranked = topPromotors
    .map((p) => {
      const total = p._count.submissions;
      const approved = approvedCountMap.get(p.id) ?? 0;
      return {
        ...p,
        total,
        approved,
        rate: total > 0 ? (approved / total) * 100 : 0,
      };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .slice(0, 10);

  // Totals (for export buttons + summary)
  const [totalSubs, totalApproved, totalReports, channels] = await Promise.all([
    prisma.submission.count({ where: { ...subScope, submittedAt: { gte: fromDate } } }),
    prisma.submission.count({
      where: { ...subScope, submittedAt: { gte: fromDate }, evaluationResult: 'approved' },
    }),
    prisma.dailyReport.count({ where: { ...reportScope, reportDate: { gte: fromDate } } }),
    channelStatus(),
  ]);
  const anyChannelReady = channels.telegram || channels.email;

  // Phase C.2: GPS heatmap — aggregate submissions theo cluster grid 0.005° (~500m)
  const gpsSubmissions = await prisma.submission.findMany({
    where: {
      ...subScope,
      submittedAt: { gte: fromDate },
      gpsLatitude: { not: null },
      gpsLongitude: { not: null },
    },
    select: {
      gpsLatitude: true,
      gpsLongitude: true,
      campaign: { select: { code: true } },
    },
  });
  const clusterMap = new Map<string, { lat: number; lng: number; count: number; sample: string }>();
  const GRID = 0.005;
  for (const s of gpsSubmissions) {
    if (s.gpsLatitude == null || s.gpsLongitude == null) continue;
    const gridLat = Math.round(s.gpsLatitude / GRID) * GRID;
    const gridLng = Math.round(s.gpsLongitude / GRID) * GRID;
    const key = `${gridLat.toFixed(3)}_${gridLng.toFixed(3)}`;
    const cur = clusterMap.get(key);
    if (cur) {
      cur.count += 1;
    } else {
      clusterMap.set(key, {
        lat: gridLat,
        lng: gridLng,
        count: 1,
        sample: s.campaign?.code || '',
      });
    }
  }
  const heatmapPoints = Array.from(clusterMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);

  // Phase C.4: SLA tracking — avg time from submittedAt → firstReviewedAt
  const reviewedSubs = await prisma.submission.findMany({
    where: {
      ...subScope,
      submittedAt: { gte: fromDate },
      firstReviewedAt: { not: null },
    },
    select: { submittedAt: true, firstReviewedAt: true },
  });
  let avgSlaMinutes = 0;
  if (reviewedSubs.length > 0) {
    const totalMs = reviewedSubs.reduce(
      (acc, s) => acc + (s.firstReviewedAt!.getTime() - s.submittedAt.getTime()),
      0,
    );
    avgSlaMinutes = Math.round(totalMs / reviewedSubs.length / 60_000);
  }
  const slaCoverage =
    totalSubs > 0 ? ((reviewedSubs.length / totalSubs) * 100).toFixed(0) : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-7 w-7" />
            Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Phân tích KPI {range} ngày — từ {formatDate(fromDate)} đến hôm nay
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant={range === 7 ? 'default' : 'outline'} size="sm">
            <Link href="/dashboard/reports?days=7">7 ngày</Link>
          </Button>
          <Button asChild variant={range === 30 ? 'default' : 'outline'} size="sm">
            <Link href="/dashboard/reports?days=30">30 ngày</Link>
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submissions</CardDescription>
            <CardTitle className="text-3xl">{totalSubs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Đạt</CardDescription>
            <CardTitle className="text-3xl">{totalApproved}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tỉ lệ đạt</CardDescription>
            <CardTitle className="text-3xl">
              {totalSubs > 0 ? ((totalApproved / totalSubs) * 100).toFixed(0) : 0}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Daily reports</CardDescription>
            <CardTitle className="text-3xl">{totalReports}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Achievement theo ngày</CardTitle>
            <CardDescription>Thực tế vs Target (cộng tất cả campaign)</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyAchievementChart data={dailyChart} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Phân bố kết quả submission</CardTitle>
            <CardDescription>Stack chart đạt / không đạt / cần xem</CardDescription>
          </CardHeader>
          <CardContent>
            <SubmissionStatusChart data={statusChart} />
          </CardContent>
        </Card>
      </div>

      {/* Branch KPI (admin only) */}
      {role !== 'branch_manager' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">So sánh chi nhánh — tỉ lệ đạt</CardTitle>
          </CardHeader>
          <CardContent>
            <BranchKpiChart data={branchKpi} />
          </CardContent>
        </Card>
      )}

      {/* Phase C.2: GPS heatmap */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapIcon className="h-4 w-4" />
            GPS Heatmap — Phân bố submissions ({range} ngày)
          </CardTitle>
          <CardDescription className="text-xs">
            {gpsSubmissions.length} submissions có GPS, gom thành {heatmapPoints.length} clusters (~500m). Color = density.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionsHeatmap points={heatmapPoints} height={400} />
        </CardContent>
      </Card>

      {/* Phase C.4: SLA tracking summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            SLA — Avg review time ({range} ngày)
          </CardTitle>
          <CardDescription className="text-xs">
            Thời gian từ submission được gửi → admin review (override hoặc add comment) đầu tiên.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Avg review time</div>
              <div className="text-2xl font-bold tabular-nums">
                {avgSlaMinutes > 0 ? `${avgSlaMinutes} min` : '—'}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Reviewed</div>
              <div className="text-2xl font-bold tabular-nums">
                {reviewedSubs.length}
                <span className="text-sm text-muted-foreground"> / {totalSubs}</span>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Coverage</div>
              <div className="text-2xl font-bold tabular-nums">{slaCoverage}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top promotors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 promotors ({range} ngày)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Promotor</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
                <TableHead className="text-right">Đạt</TableHead>
                <TableHead className="text-right">Tỉ lệ đạt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Chưa có promotor nào có submission trong khoảng thời gian này.
                  </TableCell>
                </TableRow>
              )}
              {ranked.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Badge variant={i < 3 ? 'success' : 'secondary'}>
                      #{i + 1}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/promotors/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">
                      {p.employeeCode}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.branch?.code || '—'}</TableCell>
                  <TableCell className="text-right font-mono">{p.total}</TableCell>
                  <TableCell className="text-right font-mono">{p.approved}</TableCell>
                  <TableCell className="text-right font-mono">
                    <Badge
                      variant={p.rate >= 70 ? 'success' : p.rate >= 50 ? 'warning' : 'destructive'}
                    >
                      {p.rate.toFixed(0)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Export + Notification trigger */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Xuất báo cáo Excel
            </CardTitle>
            <CardDescription>
              Tải file .xlsx chứa daily reports / submissions cho khoảng thời gian đang xem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href={`/api/export/daily-reports?days=${range}`}>
                  <Download className="h-4 w-4" />
                  Daily Reports ({totalReports} rows)
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`/api/export/submissions?days=${range}`}>
                  <Download className="h-4 w-4" />
                  Submissions ({totalSubs} rows)
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Gửi digest ngay
                </CardTitle>
                <CardDescription>
                  Gửi tổng kết hôm nay cho recipients đã đăng ký nhận daily digest.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={sendDigestNowAction}>
                  <Button type="submit" disabled={!anyChannelReady}>
                    <Send className="h-4 w-4" />
                    Trigger digest hôm nay
                  </Button>
                </form>
                {!anyChannelReady && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Chưa cấu hình channel nào.{' '}
                    <Link href="/dashboard/notifications" className="text-primary hover:underline">
                      Xem hướng dẫn
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>
      </div>
    </div>
  );
}
