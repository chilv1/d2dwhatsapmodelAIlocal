/**
 * Promotor create form — admin + branch_manager.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireRole, type Role } from '@/lib/rbac';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { createPromotorAction } from '@/lib/actions/promotor';

export const dynamic = 'force-dynamic';

export default async function NewPromotorPage() {
  const session = await requireRole(['admin', 'branch_manager']);
  const role = session.user.role as Role;

  // Branch_manager chỉ được tạo trong chi nhánh mình
  const branches = await prisma.branch.findMany({
    where:
      role === 'branch_manager' && session.user.branchId
        ? { id: session.user.branchId }
        : undefined,
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/promotors">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Thêm promotor mới</h1>
        <p className="text-muted-foreground mt-1">
          Nhân viên thực địa, link với submission để track KPI.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin nhân viên</CardTitle>
          <CardDescription>
            Mã nhân viên duy nhất, dùng để định danh trong audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createPromotorAction} className="space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee_code">Mã NV *</Label>
                <Input
                  id="employee_code"
                  name="employee_code"
                  required
                  className="font-mono"
                  placeholder="EMP_001"
                  pattern="[A-Z0-9_]+"
                  title="Chỉ chữ HOA, số, dấu _"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_id">
                  Chi nhánh {role === 'branch_manager' && '*'}
                </Label>
                <Select
                  id="branch_id"
                  name="branch_id"
                  required={role === 'branch_manager'}
                  defaultValue={
                    role === 'branch_manager' && session.user.branchId
                      ? String(session.user.branchId)
                      : ''
                  }
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

            <div className="space-y-2">
              <Label htmlFor="name">Họ tên *</Label>
              <Input id="name" name="name" required placeholder="José Ramírez" />
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" asChild variant="outline">
                <Link href="/dashboard/promotors">Huỷ</Link>
              </Button>
              <Button type="submit">Thêm promotor</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
