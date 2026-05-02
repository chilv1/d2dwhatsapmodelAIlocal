'use client';
/**
 * Embedded Leaflet map cho submission GPS — OpenStreetMap tiles (free, no API key).
 * Client-only vì Leaflet phụ thuộc DOM (window/document).
 */
import { useEffect, useState } from 'react';
import 'leaflet/dist/leaflet.css';

type Props = {
  lat: number;
  lng: number;
  address?: string | null;
  height?: number;
};

export function SubmissionMap({ lat, lng, address, height = 250 }: Props) {
  const [Map, setMap] = useState<React.ComponentType<{
    lat: number;
    lng: number;
    address?: string | null;
    height: number;
  }> | null>(null);

  useEffect(() => {
    // Dynamic import để tránh SSR issues
    import('./submission-map-inner').then((m) => setMap(() => m.MapInner));
  }, []);

  if (!Map) {
    return (
      <div
        style={{ height }}
        className="w-full rounded-md border bg-muted/20 flex items-center justify-center text-xs text-muted-foreground"
      >
        Đang tải bản đồ...
      </div>
    );
  }
  return <Map lat={lat} lng={lng} address={address} height={height} />;
}
