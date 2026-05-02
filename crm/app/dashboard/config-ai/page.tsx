/**
 * Config AI page — admin only.
 * - Toggle Detection mode / Vision cache / Submission throttle (with configurable seconds).
 * - AI Performance Stats: cache hit rate, throttle count, cost saved, top cached images.
 */
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { getSetting } from '@/lib/settings';
import { formatDateTime } from '@/lib/format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Cpu, Save, Activity } from 'lucide-react';
import { updateVisionSettingsAction } from '@/lib/actions/settings';
import { VisionModelPicker } from '@/components/vision-model-picker';

export const dynamic = 'force-dynamic';

const COST_PER_CALL_USD = 0.007; // gpt-4o vision approx

export default async function ConfigAIPage() {
  await requireRole(['admin']);

  // Date keys cho metrics — last 7 days local
  const today = new Date();
  const dateKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateKeys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }

  const [
    detectionRaw,
    cacheRaw,
    throttleRaw,
    throttleSecRaw,
    visionModelRaw,
    metricsRows,
    topCachedImages,
  ] = await Promise.all([
    getSetting('vision.detection_mode_enabled'),
    getSetting('vision.cache_enabled'),
    getSetting('submission.throttle_enabled'),
    getSetting('submission.throttle_seconds'),
    getSetting('vision.model'),
    prisma.botMetric.findMany({
      where: { date: { in: dateKeys } },
      orderBy: { date: 'asc' },
    }),
    prisma.visionCache.findMany({
      orderBy: { hits: 'desc' },
      take: 5,
    }),
  ]);

  const detectionEnabled = detectionRaw === '1';
  const cacheEnabled = cacheRaw === '1';
  const throttleEnabled = throttleRaw === '1';
  const throttleSeconds = parseInt(throttleSecRaw || '5', 10) || 5;
  const visionModel = visionModelRaw || '';

  const todayKey = dateKeys[dateKeys.length - 1];
  const sumByMetric = (metric: string, dateFilter?: string) =>
    metricsRows
      .filter((m) => m.metric === metric && (!dateFilter || m.date === dateFilter))
      .reduce((acc, m) => acc + m.count, 0);

  const stats = {
    today: {
      cacheHit: sumByMetric('cache_hit', todayKey),
      cacheMiss: sumByMetric('cache_miss', todayKey),
      throttled: sumByMetric('throttled', todayKey),
    },
    last7d: {
      cacheHit: sumByMetric('cache_hit'),
      cacheMiss: sumByMetric('cache_miss'),
      throttled: sumByMetric('throttled'),
    },
  };
  const totalEvals = stats.last7d.cacheHit + stats.last7d.cacheMiss;
  const cacheHitRate =
    totalEvals > 0 ? ((stats.last7d.cacheHit / totalEvals) * 100).toFixed(1) : '0.0';
  const costSavedUsd = (stats.last7d.cacheHit * COST_PER_CALL_USD).toFixed(3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Cpu className="h-7 w-7" />
          Config AI
        </h1>
        <p className="text-muted-foreground mt-1">
          Cấu hình AI vision, cache, throttle + xem performance stats.
        </p>
      </div>

      {/* AI Vision & Performance config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            AI Vision & Performance
          </CardTitle>
          <CardDescription className="text-xs">
            Toggle các tính năng tối ưu cost / accuracy / latency. Bot pickup setting mới
            sau tối đa 30 giây.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateVisionSettingsAction} className="space-y-4">
            {/* Model picker */}
            <div className="border-b pb-4">
              <VisionModelPicker defaultValue={visionModel} />
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="detection_enabled"
                  name="detection_enabled"
                  defaultChecked={detectionEnabled}
                  className="h-4 w-4 mt-0.5 rounded border-input"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="detection_enabled"
                    className="text-sm cursor-pointer flex items-center gap-2"
                  >
                    Detection mode{' '}
                    {detectionEnabled ? (
                      <Badge variant="success" className="text-[10px]">ON</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">OFF</Badge>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    AI chỉ detect items, code tính score deterministic. Giảm bịa items,
                    score ổn định. Chỉ áp dụng campaigns dùng structured editor.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="cache_enabled"
                  name="cache_enabled"
                  defaultChecked={cacheEnabled}
                  className="h-4 w-4 mt-0.5 rounded border-input"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="cache_enabled"
                    className="text-sm cursor-pointer flex items-center gap-2"
                  >
                    Vision cache{' '}
                    {cacheEnabled ? (
                      <Badge variant="success" className="text-[10px]">ON</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">OFF</Badge>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cache AI evaluation theo SHA-256 image hash + campaign. Cùng ảnh +
                    cùng campaign không gọi API lại — tiết kiệm cost + giảm latency.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="throttle_enabled"
                  name="throttle_enabled"
                  defaultChecked={throttleEnabled}
                  className="h-4 w-4 mt-0.5 rounded border-input"
                />
                <div className="flex-1 space-y-2">
                  <Label
                    htmlFor="throttle_enabled"
                    className="text-sm cursor-pointer flex items-center gap-2"
                  >
                    Submission throttle{' '}
                    {throttleEnabled ? (
                      <Badge variant="success" className="text-[10px]">ON</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">OFF</Badge>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cùng sender + cùng campaign trong window dưới đây → reject duplicate
                    (anti accidental double-tap). Không tốn API call cho duplicate.
                  </p>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="throttle_seconds"
                      className="text-xs text-muted-foreground"
                    >
                      Window:
                    </Label>
                    <Input
                      id="throttle_seconds"
                      name="throttle_seconds"
                      type="number"
                      min={1}
                      max={300}
                      defaultValue={throttleSeconds}
                      className="h-8 w-20 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">
                      giây (1–300, default 5)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Button type="submit" size="sm">
              <Save className="h-3.5 w-3.5" />
              Lưu cấu hình
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* AI Performance Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            AI Performance Stats — Last 7 days
          </CardTitle>
          <CardDescription className="text-xs">
            Bot tracking cache hits / API calls / throttled submissions từ DB. Update
            realtime sau mỗi event.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Today summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Cache hits (today)</div>
              <div className="text-2xl font-bold tabular-nums text-green-600">
                {stats.today.cacheHit}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">API calls (today)</div>
              <div className="text-2xl font-bold tabular-nums">
                {stats.today.cacheMiss}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Throttled (today)</div>
              <div className="text-2xl font-bold tabular-nums text-orange-600">
                {stats.today.throttled}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Cost saved (7d)</div>
              <div className="text-2xl font-bold tabular-nums text-green-600">
                ${costSavedUsd}
              </div>
            </div>
          </div>

          {/* 7-day summary */}
          <div className="text-sm space-y-1.5 border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache hit rate (7d):</span>
              <span className="font-mono font-medium">
                {cacheHitRate}% ({stats.last7d.cacheHit} / {totalEvals} evals)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Throttled (7d):</span>
              <span className="font-mono font-medium">
                {stats.last7d.throttled} duplicate submissions blocked
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground italic">
              <span>Cost estimate: ${COST_PER_CALL_USD}/call (gpt-4o vision)</span>
            </div>
          </div>

          {/* Top cached images */}
          {topCachedImages.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Top cached images (most reused)
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Image hash</TableHead>
                    <TableHead className="text-xs text-center">Campaign</TableHead>
                    <TableHead className="text-xs text-right">Hits</TableHead>
                    <TableHead className="text-xs text-right">Last hit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCachedImages.map((c) => (
                    <TableRow key={c.imageHash + c.campaignId}>
                      <TableCell className="font-mono text-xs">
                        {c.imageHash.slice(0, 12)}…
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        #{c.campaignId}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {c.hits}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {c.lastHitAt ? formatDateTime(c.lastHitAt) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
