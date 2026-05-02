'use client';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type HeatmapPoint = {
  lat: number;
  lng: number;
  count: number;
  code: string;
  name: string;
};

type Props = {
  points: HeatmapPoint[];
  height: number;
  selectedCampaign?: string | null;
};

// 10-color palette — high contrast trên green/blue map tile
const PALETTE = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
  '#84cc16', // lime
];

// Deterministic hash → palette index. String chars sum mod palette length.
// Cùng campaign code → cùng màu giữa các page reload.
function colorForCampaign(code: string): string {
  if (!code) return '#6b7280';
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
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

  // Build legend: aggregate count per campaign code, sort desc
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
                <Popup>
                  <div className="space-y-1">
                    <div className="font-mono text-xs">
                      {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </div>
                    <div className="text-sm font-bold">{p.count} submission(s)</div>
                    {p.code && (
                      <div className="text-xs">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                          style={{ background: color }}
                        />
                        <span className="font-mono">{p.code}</span>
                        {p.name && <span className="text-gray-600"> — {p.name}</span>}
                      </div>
                    )}
                    <a
                      href={`https://maps.google.com/?q=${p.lat},${p.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
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
