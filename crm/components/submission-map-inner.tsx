'use client';
/**
 * Inner Leaflet map — chỉ load khi client-side (qua dynamic import từ submission-map.tsx).
 * Workaround Leaflet's default marker icon issue với webpack/Next bundler.
 */
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon paths cho Next.js bundler
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type Props = {
  lat: number;
  lng: number;
  address?: string | null;
  height: number;
};

export function MapInner({ lat, lng, address, height }: Props) {
  const gmapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
  return (
    <div className="overflow-hidden rounded-md border" style={{ height }}>
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]}>
          <Popup>
            <div className="space-y-1">
              <div className="font-mono text-xs">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </div>
              {address && <div className="text-xs text-gray-600">{address}</div>}
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                Mở Google Maps →
              </a>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
