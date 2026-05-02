/**
 * Dashboard home — overview stats + recent submissions + today's reports.
 */
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { fileUrl } from '@/lib/files';
import { formatDateTimeShort } from '@/lib/format';
import {
  requireSession,
  submissionScopeWhere,
  campaignScopeWhere,
  type Role,
  ROLE_LABELS,
} from '@/lib/rbac';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ResultBadge, SubmissionTypeBadge } from '@/components/result-badge';
import { Image as ImageIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getStats(session: Awaited<ReturnType<typeof requireSession>>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const subWhere = submissionScopeWhere(session);
  const campWhere = campaignScopeWhere(session);
  const reportWhere = session.user.role === 'branch_manager'
    ? { campaign: { branchId: session.user.branchId ?? -1 } }
    : {};

  const [
    branches,
    teamLeaders,
    campaigns,
    activeCampaigns,
    submissions,
    submissionsToday,
    dailyReports,
    todayReports,
    users,
  ] = await Promise.all([
    prisma.branch.count(),
    prisma.teamLeader.count(),
    prisma.campaign.count({ where: campWhere }),
    prisma.campaign.count({ where: { ...campWhere, isActive: true } }),
    prisma.submission.count({ where: subWhere }),
    prisma.submission.count({
      where: { ...subWhere, submittedAt: { gte: today } },
    }),
    prisma.dailyReport.count({ where: reportWhere }),
    prisma.dailyReport.findMany({
      where: { ...reportWhere, reportDate: today },
      include: { campaign: { select: { code: true, name: true } } },
      orderBy: { id: 'desc' },
    }),
    prisma.user.count(),
  ]);
  return {
    branches,
    teamLeaders,
    campaigns,
    activeCampaigns,
    submissions,
    submissionsToday,
    dailyReports,
    users,
    todayReports,
  };
}

async function getRecentSubmissions(session: Awaited<ReturnType<typeof requireSession>>) {
  return prisma.submission.findMany({
    where: submissionScopeWhere(session),
    orderBy: { submittedAt: 'desc' },
    take: 8,
    include: {
      campaign: { select: { code: true, name: true } },
    },
  });
}

export default async function DashboardPage() {
  const session = await requireSession();
  const role = session.user.role as Role;
  const stats = await getStats(session);
  const recent = await getRecentSubmissions(session);

  const cards = [
    {
      label: 'Submissions hôm nay',
      value: stats.submissionsToday,
      hint: `Trên tổng ${stats.submissions} từ trước đến nay`,
    },
    {
      label: 'Campaign hoạt động',
      value: stats.activeCampaigns,
      hint: `Trên tổng ${stats.campaigns} campaign`,
    },
    {
      label: 'Daily Reports',
      value: stats.dailyReports,
      hint: `Báo cáo cuối ngày đã sinh tự động`,
    },
    {
      label: 'Branches',
      value: stats.branches,
      hint: 'Chi nhánh tại Peru',
    },
    {
      label: 'Team Leaders',
      value: stats.teamLeaders,
      hint: 'Người gửi ảnh qua WhatsApp',
    },
    {
      label: 'Users (CRM)',
      value: stats.users,
      hint: 'Tài khoản truy cập CRM',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {session.user.name}
        </h1>
        <p className="text-muted-foreground mt-1">
          Tổng quan hệ thống — role:{' '}
          <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {ROLE_LABELS[role] || role}
          </code>
          {role === 'branch_manager' && session.user.branchId && (
            <span className="ml-2 text-xs">(scoped tới chi nhánh #{session.user.branchId})</span>
          )}
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="text-4xl">{c.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* Today's Daily Reports */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">📊 Daily Reports hôm nay</CardTitle>
            <Badge variant="outline">{stats.todayReports.length}</Badge>
          </CardHeader>
          <CardContent>
            {stats.todayReports.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Chưa có report nào hôm nay.
              </p>
            ) : (
              <ul className="space-y-3">
                {stats.todayReports.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 text-sm border-l-2 pl-3 py-1"
                    style={{
                      borderColor: r.achieved ? 'rgb(16,185,129)' : 'rgb(239,68,68)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs">{r.campaign?.code}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {r.campaign?.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">
                        {r.actualSubscribers}/{r.targetSubscribers}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.achievementPercent?.toFixed(0)}%
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Submissions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Submissions gần đây
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/submissions">Xem tất cả →</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Người gửi</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Kết quả</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Chưa có submission nào.
                    </TableCell>
                  </TableRow>
                )}
                {recent.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      <Link
                        href={`/dashboard/submissions/${s.id}`}
                        className="hover:underline"
                      >
                        {formatDateTimeShort(s.submittedAt)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.waSenderName || '—'}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {s.campaign?.code || '—'}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
