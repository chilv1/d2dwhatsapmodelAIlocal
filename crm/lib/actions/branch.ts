'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { audit } from '@/lib/audit';

export async function updateBranchGpsAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');

  const latRaw = String(formData.get('gps_latitude') || '').trim();
  const lngRaw = String(formData.get('gps_longitude') || '').trim();
  const radiusRaw = String(formData.get('gps_radius_km') || '5').trim();

  const lat = latRaw ? parseFloat(latRaw) : null;
  const lng = lngRaw ? parseFloat(lngRaw) : null;
  const radius = parseInt(radiusRaw, 10) || 5;

  if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
    throw new Error('Latitude phải trong [-90, 90]');
  }
  if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
    throw new Error('Longitude phải trong [-180, 180]');
  }
  if (radius < 1 || radius > 1000) {
    throw new Error('Radius phải trong [1, 1000] km');
  }

  const cur = await prisma.branch.findUnique({
    where: { id },
    select: { gpsLatitude: true, gpsLongitude: true, gpsRadiusKm: true },
  });
  if (!cur) throw new Error('Branch not found');

  await prisma.branch.update({
    where: { id },
    data: { gpsLatitude: lat, gpsLongitude: lng, gpsRadiusKm: radius },
  });

  await audit({
    userId,
    action: 'branch.update_gps',
    entityType: 'branch',
    entityId: id,
    oldValue: cur,
    newValue: { gpsLatitude: lat, gpsLongitude: lng, gpsRadiusKm: radius },
  });

  revalidatePath('/dashboard/branches');
}
