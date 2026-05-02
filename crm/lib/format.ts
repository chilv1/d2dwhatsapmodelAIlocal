/**
 * Format helpers — datetime, percentage, etc.
 */

const dtf = new Intl.DateTimeFormat('vi-VN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dtfShort = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  hour12: false,
});

const df = new Intl.DateTimeFormat('vi-VN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return dtf.format(date);
}

export function formatDateTimeShort(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return dtfShort.format(date);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return df.format(date);
}

export function gpsLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}
