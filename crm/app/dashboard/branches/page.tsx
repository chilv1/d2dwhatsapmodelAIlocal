/**
 * Branches admin — quản lý GPS HQ + radius cho fuera-de-zona validation.
 * Branches table tự seed qua bot khi tạo campaign — page này CHỈ edit GPS.
 */
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Building2, Save, MapPin } from 'lucide-react';
import { updateBranchGpsAction } from '@/lib/actions/branch';

export const dynamic = 'force-dynamic';

export default async function BranchesPage() {
  await requireRole(['admin']);

  const branches = await prisma.branch.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { campaigns: true, promotors: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Building2 className="h-7 w-7" />
          Branches
        </h1>
        <p className="text-muted-foreground mt-1">
          Quản lý GPS HQ + radius cho fuera-de-zona validation. Submission GPS xa branch HQ
          quá radius → flag "ngoài vùng" + route sang needs_review.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            GPS HQ + Radius
          </CardTitle>
          <CardDescription className="text-xs">
            Lấy lat/lng HQ branch trên Google Maps (right-click → "What's here?"). Radius
            mặc định 5 km — phù hợp city. Để trống lat/lng = tắt validation cho branch đó.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead className="text-center hidden md:table-cell">Campaigns</TableHead>
                <TableHead className="text-center hidden md:table-cell">Promotors</TableHead>
                <TableHead>GPS HQ + Radius</TableHead>
                <TableHead className="text-right w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Chưa có branch nào. Branches tự được tạo khi seed.
                  </TableCell>
                </TableRow>
              )}
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm">{b.code}</TableCell>
                  <TableCell className="text-sm">
                    {b.name}
                    {b.region && (
                      <div className="text-xs text-muted-foreground">{b.region}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center hidden md:table-cell">
                    {b._count.campaigns}
                  </TableCell>
                  <TableCell className="text-center hidden md:table-cell">
                    {b._count.promotors}
                  </TableCell>
                  <TableCell colSpan={2}>
                    <form action={updateBranchGpsAction} className="flex flex-wrap gap-2 items-end">
                      <input type="hidden" name="id" value={b.id} />
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Latitude</Label>
                        <Input
                          name="gps_latitude"
                          type="number"
                          step="any"
                          defaultValue={b.gpsLatitude ?? ''}
                          placeholder="-12.0464"
                          className="w-32 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Longitude</Label>
                        <Input
                          name="gps_longitude"
                          type="number"
                          step="any"
                          defaultValue={b.gpsLongitude ?? ''}
                          placeholder="-77.0428"
                          className="w-32 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Radius (km)</Label>
                        <Input
                          name="gps_radius_km"
                          type="number"
                          min={1}
                          max={1000}
                          defaultValue={b.gpsRadiusKm}
                          className="w-20 font-mono text-xs"
                        />
                      </div>
                      <Button type="submit" size="sm">
                        <Save className="h-3.5 w-3.5" />
                        Lưu
                      </Button>
                      {b.gpsLatitude != null && b.gpsLongitude != null ? (
                        <Badge variant="success" className="text-[10px]">
                          GPS set
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          No GPS
                        </Badge>
                      )}
                    </form>
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
