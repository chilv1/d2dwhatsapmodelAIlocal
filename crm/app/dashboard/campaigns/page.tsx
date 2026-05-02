/**
 * Campaigns list — table with status toggle.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { fileUrl } from '@/lib/files';
import { formatDate } from '@/lib/format';
import { requireSession, campaignScopeWhere, canWrite } from '@/lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Power, ImageIcon } from 'lucide-react';
import { toggleCampaignActiveAction } from '@/lib/actions/campaign';

export const dynamic = 'force-dynamic';

async function loadCampaigns(session: Awaited<ReturnType<typeof requireSession>>) {
  return prisma.campaign.findMany({
    where: campaignScopeWhere(session),
    orderBy: [{ isActive: 'desc' }, { id: 'desc' }],
    include: {
      branch: { select: { code: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });
}

export default async function CampaignsPage() {
  const session = await requireSession();
  const writable = canWrite(session);
  const campaigns = await loadCampaigns(session);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground mt-1">
            Quản lý campaign + ảnh template chuẩn ({campaigns.length} campaign)
          </p>
        </div>
        {writable && (
          <Button asChild>
            <Link href="/dashboard/campaigns/new">
              <Plus className="h-4 w-4" />
              Tạo campaign mới
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Template</TableHead>
                <TableHead>Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead>Bắt đầu</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right w-[160px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    Chưa có campaign nào.{' '}
                    <Link
                      href="/dashboard/campaigns/new"
                      className="text-primary hover:underline"
                    >
                      Tạo mới
                    </Link>
                    .
                  </TableCell>
                </TableRow>
              )}
              {campaigns.map((c) => {
                const tpl = fileUrl(c.templateImagePath);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      {tpl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tpl}
                          alt={c.code}
                          className="h-12 w-16 object-cover rounded border"
                        />
                      ) : (
                        <div className="h-12 w-16 rounded border bg-muted flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{c.code}</TableCell>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {c.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.branch ? `${c.branch.code} — ${c.branch.name}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {c.targetSubscribers}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {c._count.submissions}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(c.startDate)}</TableCell>
                    <TableCell>
                      {c.isActive ? (
                        <Badge variant="success">Hoạt động</Badge>
                      ) : (
                        <Badge variant="secondary">Tạm dừng</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {writable && (
                          <form action={toggleCampaignActiveAction}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              title={c.isActive ? 'Tạm dừng' : 'Kích hoạt'}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </form>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/campaigns/${c.id}`}>Xem</Link>
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
