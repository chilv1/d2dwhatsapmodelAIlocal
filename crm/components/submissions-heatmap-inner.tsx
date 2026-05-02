'use client';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type ClusterSubmission = {
  id: number;
  imageUrl: string | null;
  sender: string;
  submittedAt: string;
  score: number | null;
  result: string;
};

export type HeatmapPoint = {
  lat: number;
  lng: number;
  count: number;
  code: string;
  name: string;
  submissions: ClusterSubmission[];
};

type Props = {
  points: HeatmapPoint[];
  height: number;
  selectedCampaign?: string | null;
};

const PALETTE = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function colorForCampaign(code: string): string {
  if (!code) return '#6b7280';
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function resultBadgeColor(result: string): string {
  if (result === 'approved') return '#10b981';
  if (result === 'rejected') return '#ef4444';
  return '#f59e0b'; // needs_review / pending
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-PE', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HeatmapInner({ points, height, selectedCampaign }: Props) {
  if (points.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full rounded-md border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground"
      >
        Chưa có submission nào có GPS.
      </div>
    );
  }

  const avgLat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const avgLng = points.reduce((a, p) => a + p.lng, 0) / points.length;

  const legendMap = new Map<string, { code: string; name: string; total: number }>();
  for (const p of points) {
    const cur = legendMap.get(p.code);
    if (cur) cur.total += p.count;
    else legendMap.set(p.code, { code: p.code, name: p.name, total: p.count });
  }
  const legend = Array.from(legendMap.values()).sort((a, b) => b.total - a.total);
  const hasSelection = !!selectedCampaign;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border" style={{ height }}>
        <MapContainer
          center={[avgLat, avgLng]}
          zoom={6}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map((p, i) => {
            const color = colorForCampaign(p.code);
            const radius = Math.min(8 + p.count * 2, 30);
            const dimmed = hasSelection && p.code !== selectedCampaign;
            const opacity = dimmed ? 0.15 : 0.7;
            const remaining = p.count - p.submissions.length;
            return (
              <CircleMarker
                key={i}
                center={[p.lat, p.lng]}
                radius={radius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: opacity,
                  opacity: dimmed ? 0.3 : 1,
                  weight: 1,
                }}
              >
                <Popup minWidth={260} maxWidth={320}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 pb-1 border-b">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: color }}
                      />
                      <span className="font-mono text-xs font-bold">{p.code}</span>
                      {p.name && (
                        <span className="text-[10px] text-gray-600 truncate">— {p.name}</span>
                      )}
                    </div>

                    <div className="text-[11px] text-gray-600 flex justify-between">
                      <span className="font-mono">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                      <span className="font-bold">{p.count} submission{p.count > 1 ? 's' : ''}</span>
                    </div>

                    {/* Thumbnails */}
                    {p.submissions.length > 0 && (
                      <div className="space-y-1.5">
                        {p.submissions.map((s) => (
                          <a
                            key={s.id}
                            href={`/dashboard/submissions/${s.id}`}
                            className="flex gap-2 items-start hover:bg-muted/50 -mx-1 px-1 py-1 rounded"
                          >
                            {s.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s.imageUrl}
                                alt=""
                                className="w-12 h-12 rounded object-cover border flex-shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] text-muted-foreground">no img</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: resultBadgeColor(s.result) }}
                                />
                                <span className="font-medium truncate">{s.sender}</span>
                              </div>
                              <div className="text-gray-500">{formatTime(s.submittedAt)}</div>
                              {s.score != null && (
                                <div className="text-gray-700">Score: {s.score}/100</div>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}

                    {remaining > 0 && (
                      <a
                        href={`/dashboard/submissions?campaign=${encodeURIComponent(p.code)}&gps_area=${p.lat},${p.lng},0.5`}
                        className="block text-center text-[11px] text-blue-600 hover:underline pt-1 border-t"
                      >
                        Xem {remaining} submission{remaining > 1 ? 's' : ''} khác →
                      </a>
                    )}

                    <a
                      href={`https://maps.google.com/?q=${p.lat},${p.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-[11px] text-gray-500 hover:underline"
                    >
                      Mở Google Maps →
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {legend.map((item) => {
          const color = colorForCampaign(item.code);
          const dim = hasSelection && item.code !== selectedCampaign;
          return (
            <div
              key={item.code}
              className="flex items-center gap-1.5"
              style={{ opacity: dim ? 0.4 : 1 }}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: color }}
              />
              <span className="font-mono">{item.code}</span>
              <span className="text-muted-foreground">({item.total})</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
