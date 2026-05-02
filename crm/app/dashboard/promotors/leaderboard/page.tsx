/**
 * Promotor leaderboard — sortable ranking table by score, approval rate, total subs.
 * Period filter: 7d / 30d / all-time qua URL search params ?days=7|30|all
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireSession, type Role } from '@/lib/rbac';
import { formatDateTime } from '@/lib/format';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
import { Trophy, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ days?: string; sort?: string }>;

const MEDALS = ['🥇', '🥈', '🥉'];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const role = session.user.role as Role;
  const params = await searchParams;
  const daysParam = params.days || '30';
  const sort = params.sort || 'rate';

  let fromDate: Date | undefined;
  if (daysParam !== 'all') {
    const days = parseInt(daysParam, 10);
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days + 1);
    fromDate.setHours(0, 0, 0, 0);
  }

  const branchScope =
    role === 'branch_manager' ? { branchId: session.user.branchId ?? -1 } : {};

  const promotors = await prisma.promotor.findMany({
    where: { isActive: true, ...branchScope },
    include: {
      branch: { select: { code: true, name: true } },
    },
  });

  // Aggregate per promotor: total + approved + avg score + last activity
  const ids = promotors.map((p) => p.id);
  const dateFilter = fromDate ? { submittedAt: { gte: fromDate } } : {};

  const [byTotal, byApproved, lastSubs, avgScores] = await Promise.all([
    prisma.submission.groupBy({
      by: ['promotorId'],
      _count: { _all: true },
      where: { promotorId: { in: ids }, ...dateFilter },
    }),
    prisma.submission.groupBy({
      by: ['promotorId'],
      _count: { _all: true },
      where: {
        promotorId: { in: ids },
        evaluationResult: 'approved',
        ...dateFilter,
      },
    }),
    prisma.submission.groupBy({
      by: ['promotorId'],
      _max: { submittedAt: true },
      where: { promotorId: { in: ids }, ...dateFilter },
    }),
    prisma.submission.groupBy({
      by: ['promotorId'],
      _avg: { similarityScore: true },
      where: {
        promotorId: { in: ids },
        similarityScore: { not: null },
        ...dateFilter,
      },
    }),
  ]);

  const totalMap = new Map(byTotal.map((x) => [x.promotorId, x._count._all]));
  const apprMap = new Map(byApproved.map((x) => [x.promotorId, x._count._all]));
  const lastMap = new Map(lastSubs.map((x) => [x.promotorId, x._max.submittedAt]));
  const scoreMap = new Map(avgScores.map((x) => [x.promotorId, x._avg.similarityScore]));

  let ranked = promotors.map((p) => {
    const total = totalMap.get(p.id) ?? 0;
    const approved = apprMap.get(p.id) ?? 0;
    return {
      ...p,
      total,
      approved,
      rate: total > 0 ? (approved / total) * 100 : 0,
      avgScore: scoreMap.get(p.id) ?? 0,
      lastAt: lastMap.get(p.id) ?? null,
    };
  });
  // Filter out zero-activity unless sort by 'all'
  ranked = ranked.filter((p) => p.total > 0);

  // Sort
  if (sort === 'total') ranked.sort((a, b) => b.total - a.total);
  else if (sort === 'score') ranked.sort((a, b) => Number(b.avgScore) - Number(a.avgScore));
  else if (sort === 'recent') ranked.sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
  else ranked.sort((a, b) => b.rate - a.rate || b.total - a.total); // default: rate

  const periodLabel = daysParam === 'all' ? 'tất cả' : `${daysParam} ngày`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/promotors">
            <ArrowLeft className="h-4 w-4" />
            Quay lại Promotors
          </Link>
        </Button>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-7 w-7" />
            Leaderboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Xếp hạng promotors theo {periodLabel} ({ranked.length} promotors có hoạt động)
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant={daysParam === '7' ? 'default' : 'outline'} size="sm">
            <Link href={`/dashboard/promotors/leaderboard?days=7&sort=${sort}`}>7 ngày</Link>
          </Button>
          <Button asChild variant={daysParam === '30' ? 'default' : 'outline'} size="sm">
            <Link href={`/dashboard/promotors/leaderboard?days=30&sort=${sort}`}>30 ngày</Link>
          </Button>
          <Button asChild variant={daysParam === 'all' ? 'default' : 'outline'} size="sm">
            <Link href={`/dashboard/promotors/leaderboard?days=all&sort=${sort}`}>All time</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Ranking</CardTitle>
            <div className="flex gap-2">
              <Link
                href={`/dashboard/promotors/leaderboard?days=${daysParam}&sort=rate`}
                className="text-xs"
              >
                <Badge variant={sort === 'rate' ? 'default' : 'secondary'} className="cursor-pointer">
                  Rate %
                </Badge>
              </Link>
              <Link
                href={`/dashboard/promotors/leaderboard?days=${daysParam}&sort=total`}
                className="text-xs"
              >
                <Badge variant={sort === 'total' ? 'default' : 'secondary'} className="cursor-pointer">
                  Total
                </Badge>
              </Link>
              <Link
                href={`/dashboard/promotors/leaderboard?days=${daysParam}&sort=score`}
                className="text-xs"
              >
                <Badge variant={sort === 'score' ? 'default' : 'secondary'} className="cursor-pointer">
                  Avg score
                </Badge>
              </Link>
              <Link
                href={`/dashboard/promotors/leaderboard?days=${daysParam}&sort=recent`}
                className="text-xs"
              >
                <Badge variant={sort === 'recent' ? 'default' : 'secondary'} className="cursor-pointer">
                  Recent
                </Badge>
              </Link>
            </div>
          </div>
          <CardDescription className="text-xs">
            Top 3 highlighted với medals 🥇🥈🥉. Click promotor name → submissions filtered.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Promotor</TableHead>
                <TableHead className="hidden md:table-cell">Chi nhánh</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right hidden md:table-cell">Approved</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Avg score</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Chưa có submission nào trong {periodLabel}.
                  </TableCell>
                </TableRow>
              )}
              {ranked.map((p, i) => (
                <TableRow
                  key={p.id}
                  className={i < 3 ? 'bg-yellow-50/50 dark:bg-yellow-950/10' : ''}
                >
                  <TableCell className="font-mono text-sm">
                    {i < 3 ? (
                      <span className="text-2xl">{MEDALS[i]}</span>
                    ) : (
                      <span className="text-muted-foreground">#{i + 1}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/submissions?promotor=${p.id}`}
                      className="hover:underline"
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {p.employeeCode}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm hidden md:table-cell">
                    {p.branch ? p.branch.code : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{p.total}</TableCell>
                  <TableCell className="text-right font-mono hidden md:table-cell">
                    {p.approved}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        p.rate >= 80 ? 'success' : p.rate >= 50 ? 'warning' : 'destructive'
                      }
                    >
                      {p.rate.toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(p.avgScore).toFixed(0)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground hidden lg:table-cell">
                    {p.lastAt ? formatDateTime(p.lastAt) : '—'}
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
