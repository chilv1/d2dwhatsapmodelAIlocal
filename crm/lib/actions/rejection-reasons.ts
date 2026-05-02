'use server';
/**
 * Server Actions for managing custom rejection reasons (admin only).
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { audit } from '@/lib/audit';

export async function addRejectionReasonAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const code = String(formData.get('code') || '').trim().toUpperCase();
  const label = String(formData.get('label') || '').trim();
  const sortOrderRaw = String(formData.get('sort_order') || '0').trim();
  const sortOrder = parseInt(sortOrderRaw, 10) || 0;

  if (!code || !/^[A-Z0-9_]+$/.test(code)) {
    throw new Error('Code phải chỉ chứa chữ HOA, số, _');
  }
  if (!label) throw new Error('Label là bắt buộc');

  await prisma.rejectionReason.create({
    data: { code, label, sortOrder, isActive: true },
  });

  await audit({
    userId,
    action: 'rejection_reason.add',
    entityType: 'rejection_reason',
    newValue: { code, label, sortOrder },
  });

  revalidatePath('/dashboard/config-ai');
}

export async function toggleRejectionReasonAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);
  const id = parseInt(String(formData.get('id') || ''), 10);

  const cur = await prisma.rejectionReason.findUnique({ where: { id } });
  if (!cur) throw new Error('Not found');

  await prisma.rejectionReason.update({
    where: { id },
    data: { isActive: !cur.isActive },
  });

  await audit({
    userId,
    action: cur.isActive ? 'rejection_reason.disable' : 'rejection_reason.enable',
    entityType: 'rejection_reason',
    entityId: id,
  });

  revalidatePath('/dashboard/config-ai');
}

export async function deleteRejectionReasonAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);
  const id = parseInt(String(formData.get('id') || ''), 10);

  const cur = await prisma.rejectionReason.findUnique({ where: { id } });
  if (!cur) return;

  await prisma.rejectionReason.delete({ where: { id } });

  await audit({
    userId,
    action: 'rejection_reason.delete',
    entityType: 'rejection_reason',
    entityId: id,
    oldValue: { code: cur.code, label: cur.label },
  });

  revalidatePath('/dashboard/config-ai');
}
