'use client';
/**
 * Submissions GPS heatmap — Leaflet circle markers, color = campaign code.
 * Cluster đơn giản bằng grid 0.005° (~500m) per (lat, lng, campaign). Top 100 clusters.
 * Lazy-load inner component để tránh SSR Leaflet issues.
 */
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { HeatmapPoint } from './submissions-heatmap-inner';

type Props = {
  points: HeatmapPoint[];
  height?: number;
  selectedCampaign?: string | null;
};

export function SubmissionsHeatmap({ points, height = 400, selectedCampaign }: Props) {
  const [Inner, setInner] = useState<React.ComponentType<{
    points: HeatmapPoint[];
    height: number;
    selectedCampaign?: string | null;
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
  return <Inner points={points} height={height} selectedCampaign={selectedCampaign} />;
}
