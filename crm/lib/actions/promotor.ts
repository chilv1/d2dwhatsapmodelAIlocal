'use server';
/**
 * Server Actions cho Promotor — admin + branch_manager (scoped).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { audit } from '@/lib/audit';

async function checkBranchScope(
  branchId: number | null,
  session: Awaited<ReturnType<typeof requireRole>>,
) {
  if (session.user.role === 'branch_manager') {
    if (!session.user.branchId) {
      throw new Error('Branch manager chưa được gán chi nhánh');
    }
    if (branchId !== session.user.branchId) {
      throw new Error('Bạn chỉ được tạo/sửa promotor của chi nhánh mình');
    }
  }
}

export async function createPromotorAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);

  const name = String(formData.get('name') || '').trim();
  const employeeCode = String(formData.get('employee_code') || '').trim().toUpperCase();
  const branchIdStr = String(formData.get('branch_id') || '');
  const branchId = branchIdStr ? parseInt(branchIdStr, 10) : null;

  if (!name) throw new Error('Tên là bắt buộc');
  if (!employeeCode) throw new Error('Mã nhân viên là bắt buộc');

  await checkBranchScope(branchId, session);

  const promotor = await prisma.promotor.create({
    data: { name, employeeCode, branchId, isActive: true },
  });

  await audit({
    userId,
    action: 'promotor.create',
    entityType: 'promotor',
    entityId: promotor.id,
    newValue: { name, employeeCode, branchId },
  });

  revalidatePath('/dashboard/promotors');
  redirect(`/dashboard/promotors/${promotor.id}`);
}

export async function updatePromotorAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');

  const cur = await prisma.promotor.findUnique({ where: { id } });
  if (!cur) throw new Error('Promotor not found');

  await checkBranchScope(cur.branchId, session);

  const name = String(formData.get('name') || cur.name).trim();
  const branchIdStr = String(formData.get('branch_id') || '');
  const branchId = branchIdStr ? parseInt(branchIdStr, 10) : null;

  await checkBranchScope(branchId, session);

  const oldVal = { name: cur.name, branchId: cur.branchId };
  const newVal = { name, branchId };

  await prisma.promotor.update({ where: { id }, data: newVal });

  await audit({
    userId,
    action: 'promotor.update',
    entityType: 'promotor',
    entityId: id,
    oldValue: oldVal,
    newValue: newVal,
  });

  revalidatePath('/dashboard/promotors');
  revalidatePath(`/dashboard/promotors/${id}`);
}

export async function togglePromotorActiveAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);
  const id = parseInt(String(formData.get('id') || ''), 10);

  const cur = await prisma.promotor.findUnique({ where: { id } });
  if (!cur) throw new Error('Promotor not found');
  await checkBranchScope(cur.branchId, session);

  await prisma.promotor.update({
    where: { id },
    data: { isActive: !cur.isActive },
  });

  await audit({
    userId,
    action: cur.isActive ? 'promotor.deactivate' : 'promotor.reactivate',
    entityType: 'promotor',
    entityId: id,
    oldValue: { isActive: cur.isActive },
    newValue: { isActive: !cur.isActive },
  });

  revalidatePath('/dashboard/promotors');
  revalidatePath(`/dashboard/promotors/${id}`);
}

/**
 * Gán submission cho promotor (manual assignment).
 */
export async function assignPromotorToSubmissionAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);

  const submissionId = parseInt(String(formData.get('submission_id') || ''), 10);
  const promotorIdStr = String(formData.get('promotor_id') || '');
  const promotorId = promotorIdStr ? parseInt(promotorIdStr, 10) : null;

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, campaignId: true, promotorId: true, campaign: { select: { branchId: true } } },
  });
  if (!sub) throw new Error('Submission not found');

  // Branch scope: branch_manager chỉ assign cho submission branch mình
  if (
    session.user.role === 'branch_manager' &&
    sub.campaign?.branchId !== session.user.branchId
  ) {
    throw new Error('Không có quyền assign submission của chi nhánh khác');
  }

  // Verify promotor cùng branch (nếu có)
  if (promotorId) {
    const prom = await prisma.promotor.findUnique({ where: { id: promotorId } });
    if (!prom) throw new Error('Promotor not found');
    if (
      session.user.role === 'branch_manager' &&
      prom.branchId !== session.user.branchId
    ) {
      throw new Error('Promotor không thuộc chi nhánh của bạn');
    }
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: { promotorId },
  });

  await audit({
    userId,
    action: 'submission.assign_promotor',
    entityType: 'submission',
    entityId: submissionId,
    oldValue: { promotorId: sub.promotorId },
    newValue: { promotorId },
  });

  revalidatePath(`/dashboard/submissions/${submissionId}`);
  revalidatePath('/dashboard/promotors');
}
