/**
 * Campaign edit form — admin + branch_manager (scoped).
 * Code không cho đổi (immutable, vì team leader đã quen mã).
 * Template image: tuỳ chọn replace.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireRole, type Role } from '@/lib/rbac';
import { fileUrl } from '@/lib/files';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ArrowLeft, ImageIcon } from 'lucide-react';
import { updateCampaignAction } from '@/lib/actions/campaign';
import { CampaignRequirementsEditor } from '@/components/campaign-requirements-editor';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

// JSON keywords array → comma-separated string (cho input defaultValue)
function keywordsToInput(jsonStr: string | null | undefined): string {
  if (!jsonStr) return '';
  try {
    const arr = JSON.parse(jsonStr);
    return Array.isArray(arr) ? arr.join(', ') : '';
  } catch {
    return '';
  }
}

export default async function EditCampaignPage({ params }: { params: Params }) {
  const session = await requireRole(['admin', 'branch_manager']);
  const role = session.user.role as Role;
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { branch: true },
  });
  if (!campaign) notFound();

  // Branch scope check
  if (
    role === 'branch_manager' &&
    campaign.branchId !== session.user.branchId
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

  const tplUrl = fileUrl(campaign.templateImagePath);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/dashboard/campaigns/${campaign.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Sửa campaign: <span className="font-mono">{campaign.code}</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Mã campaign không đổi được. Template ảnh giữ nguyên nếu không upload file mới.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin campaign</CardTitle>
          <CardDescription>
            Thay đổi sẽ áp dụng từ submission tiếp theo. Audit log ghi lại mọi sửa đổi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateCampaignAction} className="space-y-5">
            <input type="hidden" name="id" value={campaign.id} />

            <div className="space-y-2">
              <Label htmlFor="name">Tên campaign *</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={campaign.name}
                placeholder="Promoción Plan Postpago Marzo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Mô tả</Label>
              <textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={campaign.description || ''}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <Label>Yêu cầu chi tiết (cho AI)</Label>
              <CampaignRequirementsEditor defaultValue={campaign.requirementsJson} />
              <p className="text-xs text-muted-foreground">
                Thêm/sửa từng item kèm Required/Optional. AI chỉ trừ điểm cho item Required khi thiếu.
              </p>

              <details className="pt-2" open={!campaign.requirementsJson && !!campaign.templateRequirements}>
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Hoặc nhập text tự do (advanced — fallback nếu không dùng editor ở trên)
                </summary>
                <textarea
                  id="template_requirements"
                  name="template_requirements"
                  rows={5}
                  defaultValue={campaign.templateRequirements || ''}
                  className="mt-2 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                  placeholder="Standee Bipay: bắt buộc phải có. Standee Prepago papa: có thể có hoặc không. ..."
                />
              </details>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_keywords">Từ khoá đầu ngày</Label>
                <Input
                  id="start_keywords"
                  name="start_keywords"
                  placeholder="CAMPAIGN, INICIO, BẮT ĐẦU"
                  defaultValue={keywordsToInput(campaign.startKeywords)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated. Vd <code>INICIO {campaign.code}</code>. Để trống = default <code>CAMPAIGN</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_keywords">Từ khoá cuối ngày</Label>
                <Input
                  id="end_keywords"
                  name="end_keywords"
                  placeholder="END, FIN, CIERRE"
                  defaultValue={keywordsToInput(campaign.endKeywords)}
                />
                <p className="text-xs text-muted-foreground">
                  Vd <code>FIN {campaign.code} SUBS=23</code>. Để trống = default <code>END</code>.
                </p>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="target_subscribers">Mục tiêu/ngày *</Label>
                <Input
                  id="target_subscribers"
                  name="target_subscribers"
                  type="number"
                  min="1"
                  required
                  defaultValue={campaign.targetSubscribers}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert_threshold">Threshold alert (%)</Label>
                <Input
                  id="alert_threshold"
                  name="alert_threshold"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={campaign.alertThreshold ?? 50}
                />
                <p className="text-xs text-muted-foreground">
                  Reject rate ≥ ngưỡng → push alert.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_id">
                  Chi nhánh {role === 'branch_manager' && '(khoá)'}
                </Label>
                <Select
                  id="branch_id"
                  name="branch_id"
                  defaultValue={campaign.branchId ? String(campaign.branchId) : ''}
                  disabled={role === 'branch_manager'}
                >
                  {role === 'admin' && <option value="">— Toàn quốc —</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Template image */}
            <div className="space-y-2 pt-4 border-t">
              <Label>Template ảnh chuẩn</Label>
              <div className="flex gap-4 items-start">
                <div className="w-40 h-32 rounded border bg-muted/30 overflow-hidden flex items-center justify-center">
                  {tplUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tplUrl} alt="template hiện tại" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="template_image" className="text-xs font-normal text-muted-foreground">
                    Để trống = giữ template cũ. Chọn file mới = thay thế:
                  </Label>
                  <Input
                    id="template_image"
                    name="template_image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  />
                  <p className="text-xs text-muted-foreground">
                    JPG/PNG/WebP, max 10 MB. Template cũ sẽ vẫn còn trong DB cho các submission đã đánh giá.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" asChild variant="outline">
                <Link href={`/dashboard/campaigns/${campaign.id}`}>Huỷ</Link>
              </Button>
              <Button type="submit">Lưu thay đổi</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
