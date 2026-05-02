'use client';
/**
 * Submissions GPS heatmap — Leaflet circle markers (color/size = density).
 * Cluster đơn giản bằng grid 0.005° (~500m). Render top 100 clusters.
 * Lazy-load inner component để tránh SSR Leaflet issues.
 */
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';

type Point = { lat: number; lng: number; count: number; sample: string };

type Props = {
  points: Point[];
  height?: number;
};

export function SubmissionsHeatmap({ points, height = 400 }: Props) {
  const [Inner, setInner] = useState<React.ComponentType<{
    points: Point[];
    height: number;
  }> | null>(null);

  useEffect(() => {
    import('./submissions-heatmap-inner').then((m) => setInner(() => m.HeatmapInner));
  }, []);

  if (!Inner) {
    return (
      <div
        style={{ height }}
        className="w-full rounded-md border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground"
      >
        Đang tải heatmap...
      </div>
    );
  }
  return <Inner points={points} height={height} />;
}
