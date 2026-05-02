'use client';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type Point = { lat: number; lng: number; count: number; sample: string };

type Props = { points: Point[]; height: number };

function colorByCount(count: number, max: number) {
  const ratio = max > 0 ? count / max : 0;
  if (ratio > 0.66) return '#dc2626'; // red — hot
  if (ratio > 0.33) return '#f59e0b'; // orange — warm
  return '#3b82f6'; // blue — cool
}

export function HeatmapInner({ points, height }: Props) {
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

  // Auto-center map
  const avgLat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const avgLng = points.reduce((a, p) => a + p.lng, 0) / points.length;
  const maxCount = Math.max(...points.map((p) => p.count));

  return (
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
          const color = colorByCount(p.count, maxCount);
          const radius = Math.min(8 + p.count * 2, 30);
          return (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.6,
                weight: 1,
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="font-mono text-xs">
                    {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                  </div>
                  <div className="text-sm font-bold">{p.count} submission(s)</div>
                  {p.sample && (
                    <div className="text-xs text-gray-600">Sample: {p.sample}</div>
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
  );
}
