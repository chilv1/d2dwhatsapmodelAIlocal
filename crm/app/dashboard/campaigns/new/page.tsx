/**
 * Campaign create form — multipart upload template image.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { createCampaignAction } from '@/lib/actions/campaign';
import { CampaignRequirementsEditor } from '@/components/campaign-requirements-editor';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage() {
  const branches = await prisma.branch.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/campaigns">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tạo campaign mới</h1>
        <p className="text-muted-foreground mt-1">
          Upload ảnh template chuẩn — AI sẽ dùng làm chuẩn so sánh.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin campaign</CardTitle>
          <CardDescription>Tất cả trường có dấu * là bắt buộc.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createCampaignAction} className="space-y-5">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">Mã campaign *</Label>
                <Input
                  id="code"
                  name="code"
                  required
                  placeholder="PROMO_LIMA_001"
                  className="font-mono"
                  pattern="[A-Z0-9_]+"
                  title="Chỉ chữ HOA, số, dấu _"
                />
                <p className="text-xs text-muted-foreground">
                  Team leader sẽ gửi <code>CAMPAIGN &lt;mã&gt;</code> qua WhatsApp.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch_id">Chi nhánh</Label>
                <Select id="branch_id" name="branch_id">
                  <option value="">— Không chọn (toàn quốc) —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Tên campaign *</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Promoción Plan Postpago Marzo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Mô tả</Label>
              <textarea
                id="description"
                name="description"
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Khuyến mãi gói trả sau tháng 3 tại Lima"
              />
            </div>

            <div className="space-y-2">
              <Label>Yêu cầu chi tiết (cho AI)</Label>
              <CampaignRequirementsEditor />
              <p className="text-xs text-muted-foreground">
                Thêm từng item kèm Required/Optional. AI chỉ trừ điểm cho item Required khi thiếu.
              </p>

              <details className="pt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Hoặc nhập text tự do (advanced — fallback nếu không dùng editor ở trên)
                </summary>
                <textarea
                  id="template_requirements"
                  name="template_requirements"
                  rows={4}
                  className="mt-2 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Banner đỏ Telecom Big rộng 2m, đặt phía trước điểm bán DF. Promotor mặc áo đỏ đồng phục..."
                />
              </details>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_keywords">Từ khoá đầu ngày (start)</Label>
                <Input
                  id="start_keywords"
                  name="start_keywords"
                  placeholder="CAMPAIGN, INICIO, BẮT ĐẦU"
                />
                <p className="text-xs text-muted-foreground">
                  Các từ phẩy phân cách. Bot match khi promotor gõ <code>{`<keyword>`} {`<mã>`}</code>.
                  Để trống = default <code>CAMPAIGN</code>.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_keywords">Từ khoá cuối ngày (end)</Label>
                <Input
                  id="end_keywords"
                  name="end_keywords"
                  placeholder="END, FIN, CIERRE"
                />
                <p className="text-xs text-muted-foreground">
                  Vd <code>FIN MERCADO_01 SUBS=23</code>. Để trống = default <code>END</code>.
                </p>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="target_subscribers">Mục tiêu thuê bao/ngày</Label>
                <Input
                  id="target_subscribers"
                  name="target_subscribers"
                  type="number"
                  min="1"
                  defaultValue={20}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template_image">Ảnh template chuẩn *</Label>
                <Input
                  id="template_image"
                  name="template_image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  JPG/PNG/WebP, tối đa 10 MB.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" asChild variant="outline">
                <Link href="/dashboard/campaigns">Huỷ</Link>
              </Button>
              <Button type="submit">Tạo campaign</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
