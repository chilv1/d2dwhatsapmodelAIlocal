/**
 * Campaign detail — info + template preview + recent submissions + daily reports.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { fileUrl } from '@/lib/files';
import { formatDate, formatDateTimeShort } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Power, Target, Calendar, Pencil } from 'lucide-react';
import { toggleCampaignActiveAction } from '@/lib/actions/campaign';
import { requireSession, canWrite, type Role } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function CampaignDetailPage({ params }: { params: Params }) {
  const session = await requireSession();
  const role = session.user.role as Role;
  const writable = canWrite(session);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      branch: true,
      _count: { select: { submissions: true, dailyReports: true } },
    },
  });
  if (!campaign) notFound();

  const [recentSubmissions, recentReports] = await Promise.all([
    prisma.submission.findMany({
      where: { campaignId: id },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    }),
    prisma.dailyReport.findMany({
      where: { campaignId: id },
      orderBy: { reportDate: 'desc' },
      take: 7,
    }),
  ]);

  const tplUrl = fileUrl(campaign.templateImagePath);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight font-mono">
              {campaign.code}
            </h1>
            {campaign.isActive ? (
              <Badge variant="success">Hoạt động</Badge>
            ) : (
              <Badge variant="secondary">Tạm dừng</Badge>
            )}
          </div>
          <p className="text-lg">{campaign.name}</p>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {writable && (
            <Button asChild>
              <Link href={`/dashboard/campaigns/${campaign.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Sửa
              </Link>
            </Button>
          )}
          {writable && (
            <form action={toggleCampaignActiveAction}>
              <input type="hidden" name="id" value={campaign.id} />
              <Button type="submit" variant="outline">
                <Power className="h-4 w-4" />
                {campaign.isActive ? 'Tạm dừng' : 'Kích hoạt'}
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Mục tiêu</span>
            </div>
            <CardTitle className="text-3xl">{campaign.targetSubscribers}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">thuê bao / ngày</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              Submissions
            </div>
            <CardTitle className="text-3xl">{campaign._count.submissions}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">tổng ảnh đã nhận</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Bắt đầu</span>
            </div>
            <CardTitle className="text-xl">{formatDate(campaign.startDate)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Chi nhánh:{' '}
              {campaign.branch ? (
                <span className="text-foreground">
                  {campaign.branch.code} — {campaign.branch.name}
                </span>
              ) : (
                'Toàn quốc'
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Template chuẩn</CardTitle>
          </CardHeader>
          <CardContent>
            {tplUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tplUrl}
                alt="Template"
                className="w-full rounded-md border bg-muted/30 object-contain max-h-[300px]"
              />
            ) : (
              <div className="h-48 flex items-center justify-center bg-muted rounded-md text-muted-foreground text-sm">
                Chưa có template
              </div>
            )}
            {campaign.templateRequirements && (
              <div className="mt-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Yêu cầu chi tiết
                </div>
                <p className="text-sm whitespace-pre-wrap">{campaign.templateRequirements}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Daily Reports gần đây</CardTitle>
            <span className="text-xs text-muted-foreground">
              {campaign._count.dailyReports} report
            </span>
          </CardHeader>
          <CardContent>
            {recentReports.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Chưa có daily report.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>Kết quả</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentReports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.reportDate)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.actualSubscribers}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.targetSubscribers}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.achievementPercent?.toFixed(0) ?? 0}%
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.achieved ? 'success' : 'destructive'}>
                          {r.achieved ? 'ĐẠT' : 'CHƯA ĐẠT'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Submissions gần đây</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/dashboard/submissions?campaign=${encodeURIComponent(campaign.code)}`}
            >
              Xem tất cả →
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Chưa có submission nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">ID</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Người gửi</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSubmissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">#{s.id}</TableCell>
                    <TableCell className="text-sm">
                      {formatDateTimeShort(s.submittedAt)}
                    </TableCell>
                    <TableCell className="text-sm">{s.waSenderName || '—'}</TableCell>
                    <TableCell>
                      <SubmissionTypeBadge type={s.submissionType} />
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {s.similarityScore ?? '—'}
                    </TableCell>
                    <TableCell>
                      <ResultBadge result={s.evaluationResult} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/dashboard/submissions/${s.id}`}>Xem</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
