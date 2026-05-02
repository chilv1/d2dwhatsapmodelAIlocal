/**
 * Submission detail — side-by-side ảnh template vs submission, AI feedback, GPS.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { fileUrl } from '@/lib/files';
import { formatDateTime, gpsLink } from '@/lib/format';
import { requireSession, canWrite, type Role } from '@/lib/rbac';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ResultBadge, SubmissionTypeBadge } from '@/components/result-badge';
import { SubmissionMap } from '@/components/submission-map';
import {
  ArrowLeft,
  MapPin,
  CalendarClock,
  User,
  Megaphone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { overrideSubmissionAction, deleteSubmissionAction } from '@/lib/actions/submission';
import { assignPromotorToSubmissionAction } from '@/lib/actions/promotor';
import { DeleteSubmissionButton } from '@/components/delete-submission-button';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

type AIRaw = {
  similarity_score: number;
  meets_standard: boolean;
  matches: string[];
  issues: string[];
  feedback_for_user: string;
  needs_resubmit: boolean;
};

export default async function SubmissionDetailPage({ params }: { params: Params }) {
  const session = await requireSession();
  const role = session.user.role as Role;
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const sub = await prisma.submission.findUnique({
    where: { id },
    include: {
      campaign: { include: { branch: true } },
      teamLeader: { include: { branch: true } },
      overrideUser: { select: { name: true, email: true } },
      promotor: { select: { id: true, name: true, employeeCode: true } },
    },
  });
  if (!sub) notFound();

  // Branch scoping: branch_manager chỉ xem được data branch mình
  if (
    role === 'branch_manager' &&
    sub.campaign?.branchId &&
    sub.campaign.branchId !== session.user.branchId
  ) {
    notFound();
  }

  const canOverride = canWrite(session) && (role === 'admin' || role === 'branch_manager');
  const canDelete = role === 'admin';

  // Load promotors cùng branch của campaign (cho assign dropdown)
  const promotors = canOverride
    ? await prisma.promotor.findMany({
        where: {
          isActive: true,
          ...(sub.campaign?.branchId ? { branchId: sub.campaign.branchId } : {}),
        },
        select: { id: true, name: true, employeeCode: true },
        orderBy: { name: 'asc' },
      })
    : [];

  const subImageUrl = fileUrl(sub.imagePath);
  const tplImageUrl = fileUrl(sub.campaign?.templateImagePath);
  const map = gpsLink(sub.gpsLatitude, sub.gpsLongitude);

  let aiRaw: AIRaw | null = null;
  try {
    if (sub.aiRawResponse) {
      aiRaw = JSON.parse(sub.aiRawResponse) as AIRaw;
    }
  } catch {
    /* ignore parse error */
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/submissions">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
        {canDelete && (
          <DeleteSubmissionButton
            id={sub.id}
            action={deleteSubmissionAction}
            variant="text"
            redirectAfter="/dashboard/submissions"
          />
        )}
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">Submission #{sub.id}</h1>
            <SubmissionTypeBadge type={sub.submissionType} />
            <ResultBadge result={sub.evaluationResult} />
            {sub.manualOverride && (
              <Badge variant="warning">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Override
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" />
              {formatDateTime(sub.submittedAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {sub.waSenderName || sub.teamLeader?.name || sub.waSenderNumber || '—'}
            </span>
            {sub.campaign && (
              <Link
                href={`/dashboard/campaigns/${sub.campaign.id}`}
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Megaphone className="h-4 w-4" />
                {sub.campaign.code}
              </Link>
            )}
          </div>
        </div>
        {sub.similarityScore !== null && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              AI Score
            </div>
            <div className="text-5xl font-bold tabular-nums">
              {sub.similarityScore}
              <span className="text-2xl text-muted-foreground">/100</span>
            </div>
          </div>
        )}
      </div>

      {/* Side-by-side ảnh */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📋 Template chuẩn</CardTitle>
            <CardDescription>
              {sub.campaign?.name || 'Không có campaign liên kết'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tplImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tplImageUrl}
                alt="Template"
                className="w-full rounded-md border bg-muted/30 object-contain max-h-[500px]"
              />
            ) : (
              <div className="flex items-center justify-center h-64 bg-muted rounded-md text-muted-foreground text-sm">
                Chưa có template
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">📸 Ảnh team leader gửi</CardTitle>
            <CardDescription>{formatDateTime(sub.submittedAt)}</CardDescription>
          </CardHeader>
          <CardContent>
            {subImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={subImageUrl}
                alt="Submission"
                className="w-full rounded-md border bg-muted/30 object-contain max-h-[500px]"
              />
            ) : (
              <div className="flex items-center justify-center h-64 bg-muted rounded-md text-muted-foreground text-sm">
                Không có ảnh
              </div>
            )}
            {sub.caption && (
              <div className="mt-3 text-xs">
                <span className="text-muted-foreground">Caption: </span>
                <code className="font-mono bg-muted px-1.5 py-0.5 rounded">
                  {sub.caption}
                </code>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI evaluation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🤖 Đánh giá AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sub.aiFeedback && (
            <div className="bg-muted/50 rounded-md p-4 text-sm whitespace-pre-wrap">
              {sub.aiFeedback}
            </div>
          )}

          {aiRaw && (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Khớp template ({aiRaw.matches?.length || 0})
                </div>
                <ul className="space-y-1 text-sm">
                  {aiRaw.matches?.length ? (
                    aiRaw.matches.map((m, i) => (
                      <li key={i} className="text-foreground">
                        • {m}
                      </li>
                    ))
                  ) : (
                    <li className="text-muted-foreground italic">(không có)</li>
                  )}
                </ul>
              </div>

              <div>
                <div className="text-xs font-medium text-destructive uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5" />
                  Vấn đề ({aiRaw.issues?.length || 0})
                </div>
                <ul className="space-y-1 text-sm">
                  {aiRaw.issues?.length ? (
                    aiRaw.issues.map((m, i) => (
                      <li key={i} className="text-foreground">
                        • {m}
                      </li>
                    ))
                  ) : (
                    <li className="text-muted-foreground italic">(không có)</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {sub.evaluationResult === 'needs_review' && !aiRaw && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded">
              <AlertCircle className="h-4 w-4" />
              AI chưa đánh giá hoặc bị lỗi (xem feedback ở trên).
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promotor assignment */}
      {canOverride && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              👤 Promotor đảm nhận
            </CardTitle>
            <CardDescription>
              Gán submission này cho 1 promotor để theo dõi KPI cá nhân.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sub.promotor ? (
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">
                  Đã gán cho{' '}
                  <Link
                    href={`/dashboard/promotors/${sub.promotor.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {sub.promotor.name}
                  </Link>
                  <span className="text-muted-foreground ml-2 font-mono text-xs">
                    ({sub.promotor.employeeCode})
                  </span>
                </div>
                <form action={assignPromotorToSubmissionAction}>
                  <input type="hidden" name="submission_id" value={sub.id} />
                  <input type="hidden" name="promotor_id" value="" />
                  <Button type="submit" variant="outline" size="sm">
                    Bỏ gán
                  </Button>
                </form>
              </div>
            ) : (
              <form action={assignPromotorToSubmissionAction} className="flex gap-3 items-end">
                <input type="hidden" name="submission_id" value={sub.id} />
                <div className="flex-1 space-y-2">
                  <Label htmlFor="promotor_id">Chọn promotor</Label>
                  <Select id="promotor_id" name="promotor_id" required>
                    <option value="">— Chọn promotor —</option>
                    {promotors.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} ({p.employeeCode})
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" size="default">
                  Gán
                </Button>
              </form>
            )}
            {promotors.length === 0 && !sub.promotor && (
              <p className="text-xs text-muted-foreground mt-2">
                Chưa có promotor nào trong chi nhánh này.{' '}
                <Link href="/dashboard/promotors/new" className="text-primary hover:underline">
                  Thêm promotor
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual override */}
      {canOverride && sub.campaignId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-700" />
              Manual override AI verdict
            </CardTitle>
            <CardDescription>
              Nếu AI đánh giá sai, admin/quản lý có thể override verdict (sẽ được audit log).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sub.manualOverride ? (
              <div className="space-y-4">
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
                  <div className="font-medium">
                    AI đánh giá <code className="font-mono">{sub.aiRawResponse ? JSON.parse(sub.aiRawResponse).meets_standard ? 'approved' : 'rejected' : '—'}</code>{' '}
                    · Override thành{' '}
                    <Badge
                      variant={sub.manualOverride === 'approved' ? 'success' : 'destructive'}
                    >
                      {sub.manualOverride === 'approved' ? 'Đạt' : 'Không đạt'}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Bởi <strong>{sub.overrideUser?.name}</strong>{' '}
                    lúc {formatDateTime(sub.overriddenAt)}
                  </div>
                  {sub.overrideReason && (
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground">Lý do: </span>
                      {sub.overrideReason}
                    </div>
                  )}
                </div>
                <form action={overrideSubmissionAction}>
                  <input type="hidden" name="id" value={sub.id} />
                  <input type="hidden" name="new_result" value="clear" />
                  <Button type="submit" variant="outline" size="sm">
                    Bỏ override (quay về AI verdict)
                  </Button>
                </form>
              </div>
            ) : (
              <form action={overrideSubmissionAction} className="space-y-3">
                <input type="hidden" name="id" value={sub.id} />
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="new_result">Verdict mới</Label>
                    <Select id="new_result" name="new_result" required defaultValue="approved">
                      <option value="approved">Đạt (override approved)</option>
                      <option value="rejected">Không đạt (override rejected)</option>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="reason">Lý do *</Label>
                    <Input
                      id="reason"
                      name="reason"
                      required
                      placeholder="Vd: AI tưởng banner sai nhưng do góc chụp"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="default" size="sm">
                    Override verdict
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin chi tiết</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 grid-cols-1 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">WhatsApp Number</dt>
              <dd className="font-mono">{sub.waSenderNumber || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">WhatsApp Message ID</dt>
              <dd className="font-mono text-xs truncate">{sub.waMessageId || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Chi nhánh</dt>
              <dd>
                {sub.teamLeader?.branch?.name ||
                  sub.campaign?.branch?.name ||
                  '—'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground mb-1">GPS</dt>
              <dd>
                {sub.gpsLatitude != null && sub.gpsLongitude != null ? (
                  <div className="space-y-2">
                    <SubmissionMap
                      lat={sub.gpsLatitude}
                      lng={sub.gpsLongitude}
                      address={sub.gpsAddress}
                      height={250}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <a
                        href={map!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 font-mono"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        {sub.gpsLatitude.toFixed(6)}, {sub.gpsLongitude.toFixed(6)}
                      </a>
                      {sub.gpsAddress && (
                        <span className="text-muted-foreground truncate ml-2">
                          {sub.gpsAddress}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">— (chưa có GPS)</span>
                )}
              </dd>
            </div>
            {sub.submissionType === 'campaign_end' && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground">
                  Số thuê bao báo cáo
                </dt>
                <dd className="text-2xl font-bold tabular-nums">
                  {sub.reportedSubscribers ?? '—'}
                  {sub.campaign && (
                    <span className="text-sm text-muted-foreground font-normal ml-2">
                      / {sub.campaign.targetSubscribers} target
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
