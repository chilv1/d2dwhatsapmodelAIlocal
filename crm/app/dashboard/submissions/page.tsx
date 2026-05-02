/**
 * Submissions list — filter + pagination, đọc trực tiếp từ Prisma.
 * URL search params: page, campaign, branch, result, type, promotor,
 *   score_min, score_max, from, to, has_gps, vision_cached, gps_area
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireSession, submissionScopeWhere } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SubmissionsTable } from '@/components/submissions-table';
import { SubmissionsPoller } from '@/components/submissions-poller';
import {
  deleteSubmissionAction,
  bulkOverrideAction,
  bulkDeleteAction,
} from '@/lib/actions/submission';
import { type Role } from '@/lib/rbac';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  page?: string;
  campaign?: string;
  branch?: string;
  result?: string;
  type?: string;
  promotor?: string;
  score_min?: string;
  score_max?: string;
  from?: string;
  to?: string;
  has_gps?: string;
  vision_cached?: string;
  gps_area?: string; // "lat,lng,radius_km"
}>;

async function loadFilters() {
  const [campaigns, branches, promotors] = await Promise.all([
    prisma.campaign.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.branch.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.promotor.findMany({
      where: { isActive: true },
      select: { id: true, name: true, employeeCode: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return { campaigns, branches, promotors };
}

// Haversine distance km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function loadSubmissions(
  params: Awaited<SearchParams>,
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const page = Math.max(1, parseInt(params.page || '1', 10));
  const skip = (page - 1) * PAGE_SIZE;

  const scopeWhere = submissionScopeWhere(session);
  const where: Record<string, unknown> = { ...scopeWhere };
  if (params.campaign) where.campaign = { code: params.campaign.toUpperCase() };
  if (params.result) where.evaluationResult = params.result;
  if (params.type) where.submissionType = params.type;
  if (params.promotor) where.promotorId = parseInt(params.promotor, 10);
  if (params.branch) {
    where.campaign = {
      ...(where.campaign as object),
      branchId: parseInt(params.branch, 10),
    };
  }

  // Score range
  if (params.score_min || params.score_max) {
    const range: Record<string, number> = {};
    if (params.score_min) range.gte = parseInt(params.score_min, 10);
    if (params.score_max) range.lte = parseInt(params.score_max, 10);
    where.similarityScore = range;
  }

  // Date range
  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.gte = new Date(params.from);
    if (params.to) {
      const end = new Date(params.to);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    where.submittedAt = range;
  }

  // Has GPS filter
  if (params.has_gps === 'true') {
    where.gpsLatitude = { not: null };
  } else if (params.has_gps === 'false') {
    where.gpsLatitude = null;
  }

  // Vision cached filter
  if (params.vision_cached === 'true') where.visionCached = true;
  else if (params.vision_cached === 'false') where.visionCached = false;

  // GPS area: post-filter (Prisma SQLite không support spatial)
  let gpsAreaFilter: { lat: number; lng: number; radius: number } | null = null;
  if (params.gps_area) {
    const parts = params.gps_area.split(',').map((s) => parseFloat(s.trim()));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      gpsAreaFilter = { lat: parts[0], lng: parts[1], radius: parts[2] };
    }
  }

  // Nếu có GPS area filter → fetch nhiều hơn, lọc xong rồi mới paginate
  const fetchTake = gpsAreaFilter ? 500 : PAGE_SIZE;
  const fetchSkip = gpsAreaFilter ? 0 : skip;

  const [rawItems, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: fetchSkip,
      take: fetchTake,
      include: {
        campaign: { select: { code: true, name: true } },
        teamLeader: { select: { name: true } },
      },
    }),
    prisma.submission.count({ where }),
  ]);

  let items = rawItems;
  let effectiveTotal = total;
  if (gpsAreaFilter) {
    const filtered = rawItems.filter((s) => {
      if (s.gpsLatitude == null || s.gpsLongitude == null) return false;
      const d = haversineKm(
        s.gpsLatitude,
        s.gpsLongitude,
        gpsAreaFilter!.lat,
        gpsAreaFilter!.lng,
      );
      return d <= gpsAreaFilter!.radius;
    });
    effectiveTotal = filtered.length;
    items = filtered.slice(skip, skip + PAGE_SIZE);
  }

  return {
    items,
    total: effectiveTotal,
    page,
    totalPages: Math.max(1, Math.ceil(effectiveTotal / PAGE_SIZE)),
  };
}

function buildUrl(base: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

// Quick filter chip definitions
const QUICK_CHIPS: Array<{ label: string; emoji: string; params: Record<string, string> }> = [
  {
    label: 'Today',
    emoji: '🔍',
    params: { from: new Date().toISOString().slice(0, 10) },
  },
  { label: 'Needs review', emoji: '⏳', params: { result: 'needs_review' } },
  { label: 'Rejected', emoji: '❌', params: { result: 'rejected' } },
  { label: 'Score < 50', emoji: '🔥', params: { score_max: '49' } },
  { label: 'No GPS', emoji: '📍', params: { has_gps: 'false' } },
];

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const role = session.user.role as Role;
  const isAdmin = role === 'admin';
  const params = await searchParams;
  const { items, total, page, totalPages } = await loadSubmissions(params, session);
  const { campaigns, branches, promotors } = await loadFilters();

  // Count active filters
  const activeFilterKeys = Object.keys(params).filter(
    (k) => k !== 'page' && params[k as keyof typeof params],
  );

  const initialLatestId = items[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <SubmissionsPoller initialLatestId={initialLatestId} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Submissions</h1>
          <p className="text-muted-foreground mt-1">
            Tất cả ảnh team leader gửi qua WhatsApp ({total} kết quả)
          </p>
        </div>
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/submissions">
          <Badge
            variant={activeFilterKeys.length === 0 ? 'default' : 'secondary'}
            className="cursor-pointer"
          >
            All
          </Badge>
        </Link>
        {QUICK_CHIPS.map((chip) => {
          const isActive = Object.entries(chip.params).every(
            ([k, v]) => (params as Record<string, string | undefined>)[k] === v,
          );
          return (
            <Link
              key={chip.label}
              href={buildUrl('/dashboard/submissions', chip.params)}
            >
              <Badge
                variant={isActive ? 'default' : 'secondary'}
                className="cursor-pointer"
              >
                {chip.emoji} {chip.label}
              </Badge>
            </Link>
          );
        })}
        {activeFilterKeys.length > 0 && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {activeFilterKeys.length} filter active
          </Badge>
        )}
      </div>

      {/* Advanced filter form (collapsible) */}
      <Card>
        <details open={activeFilterKeys.length > 0}>
          <summary className="cursor-pointer list-none p-4 hover:bg-accent/30 rounded-t-lg">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Bộ lọc nâng cao</span>
              {activeFilterKeys.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {activeFilterKeys.length}
                </Badge>
              )}
            </div>
          </summary>
          <div className="p-4 pt-0 border-t">
            <form className="grid gap-3 grid-cols-1 sm:grid-cols-3 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Campaign</label>
                <Select name="campaign" defaultValue={params.campaign || ''}>
                  <option value="">— Tất cả —</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Chi nhánh</label>
                <Select name="branch" defaultValue={params.branch || ''}>
                  <option value="">— Tất cả —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Promotor</label>
                <Select name="promotor" defaultValue={params.promotor || ''}>
                  <option value="">— Tất cả —</option>
                  {promotors.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name} ({p.employeeCode})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Kết quả</label>
                <Select name="result" defaultValue={params.result || ''}>
                  <option value="">— Tất cả —</option>
                  <option value="approved">Đạt</option>
                  <option value="rejected">Không đạt</option>
                  <option value="needs_review">Cần xem</option>
                  <option value="pending">Đang chờ</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Loại</label>
                <Select name="type" defaultValue={params.type || ''}>
                  <option value="">— Tất cả —</option>
                  <option value="campaign_start">Đầu ngày</option>
                  <option value="campaign_end">Cuối ngày</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Score min</label>
                <Input
                  name="score_min"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={params.score_min || ''}
                  placeholder="0"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Score max</label>
                <Input
                  name="score_max"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={params.score_max || ''}
                  placeholder="100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Từ ngày</label>
                <Input
                  name="from"
                  type="date"
                  defaultValue={params.from || ''}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Đến ngày</label>
                <Input
                  name="to"
                  type="date"
                  defaultValue={params.to || ''}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Có GPS</label>
                <Select name="has_gps" defaultValue={params.has_gps || ''}>
                  <option value="">— Không lọc —</option>
                  <option value="true">Có GPS</option>
                  <option value="false">Không GPS</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cached</label>
                <Select
                  name="vision_cached"
                  defaultValue={params.vision_cached || ''}
                >
                  <option value="">— Không lọc —</option>
                  <option value="true">Cached (⚡)</option>
                  <option value="false">API call</option>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">
                  GPS area (lat,lng,radius_km)
                </label>
                <Input
                  name="gps_area"
                  defaultValue={params.gps_area || ''}
                  placeholder="-12.04, -77.03, 5"
                  className="font-mono text-xs"
                />
              </div>

              <div className="flex gap-2 sm:col-span-3 lg:col-span-4 justify-end pt-1">
                <Button type="submit" size="sm">
                  Áp dụng
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/submissions">Reset</Link>
                </Button>
              </div>
            </form>
          </div>
        </details>
      </Card>

      <Card>
        <CardContent className="p-0">
          <SubmissionsTable
            items={items}
            isAdmin={isAdmin}
            deleteAction={deleteSubmissionAction}
            bulkOverrideAction={bulkOverrideAction}
            bulkDeleteAction={bulkDeleteAction}
          />
        </CardContent>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Trang {page} / {totalPages} ({total} submissions)
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                <Link
                  href={buildUrl('/dashboard/submissions', {
                    ...(params as Record<string, string | undefined>),
                    page: String(page - 1),
                  })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
              >
                <Link
                  href={buildUrl('/dashboard/submissions', {
                    ...(params as Record<string, string | undefined>),
                    page: String(page + 1),
                  })}
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
