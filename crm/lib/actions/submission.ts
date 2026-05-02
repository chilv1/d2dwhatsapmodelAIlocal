'use server';
/**
 * Server Actions cho Submission — manual override (admin/branch_manager) + delete (admin).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { unlink } from 'node:fs/promises';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { checkAndSendRejectAlert } from '@/lib/notify/alerts';

export async function overrideSubmissionAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  const newResult = String(formData.get('new_result') || '').trim(); // 'approved' | 'rejected' | 'clear'
  const reason = String(formData.get('reason') || '').trim();
  if (Number.isNaN(id)) throw new Error('Bad id');
  if (!['approved', 'rejected', 'clear'].includes(newResult)) {
    throw new Error('new_result phải là approved/rejected/clear');
  }
  if (newResult !== 'clear' && !reason) {
    throw new Error('Lý do override là bắt buộc');
  }

  const cur = await prisma.submission.findUnique({
    where: { id },
    select: {
      id: true,
      campaignId: true,
      evaluationResult: true,
      manualOverride: true,
      overrideReason: true,
    },
  });
  if (!cur) throw new Error('Submission not found');

  // Branch scoping: branch_manager chỉ được override submission của campaign branch mình
  if (session.user.role === 'branch_manager' && cur.campaignId) {
    const camp = await prisma.campaign.findUnique({
      where: { id: cur.campaignId },
      select: { branchId: true },
    });
    if (camp?.branchId !== session.user.branchId) {
      throw new Error('Bạn không có quyền override submission của chi nhánh khác');
    }
  }

  const isClear = newResult === 'clear';
  await prisma.submission.update({
    where: { id },
    data: {
      manualOverride: isClear ? null : newResult,
      overrideUserId: isClear ? null : userId,
      overrideReason: isClear ? null : reason,
      overriddenAt: isClear ? null : new Date(),
      // Cập nhật evaluationResult chính (effective verdict)
      evaluationResult: isClear ? cur.evaluationResult : newResult,
    },
  });

  await audit({
    userId,
    action: 'submission.override',
    entityType: 'submission',
    entityId: id,
    oldValue: {
      evaluationResult: cur.evaluationResult,
      manualOverride: cur.manualOverride,
      overrideReason: cur.overrideReason,
    },
    newValue: {
      evaluationResult: isClear ? cur.evaluationResult : newResult,
      manualOverride: isClear ? null : newResult,
      overrideReason: isClear ? null : reason,
    },
  });

  // Realtime alert hook: nếu override THÀNH rejected → check rate
  if (!isClear && newResult === 'rejected' && cur.campaignId) {
    checkAndSendRejectAlert(cur.campaignId).catch((e) =>
      console.warn('[alert] check fail:', (e as Error).message),
    );
  }

  revalidatePath(`/dashboard/submissions/${id}`);
  revalidatePath('/dashboard/submissions');
  revalidatePath('/dashboard');
}

/**
 * Hard delete submission (admin only).
 * - Cleanup file ảnh trong uploads/ (fail-soft nếu file không còn)
 * - Clear FK trong daily_reports (start/end submission_id) trước khi delete
 * - Audit log với snapshot toàn bộ row trước khi xoá
 */
export async function deleteSubmissionAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');

  const sub = await prisma.submission.findUnique({
    where: { id },
    include: { campaign: { select: { code: true } } },
  });
  if (!sub) throw new Error('Submission not found');

  // Snapshot cho audit
  const snapshot = {
    id: sub.id,
    campaign: sub.campaign?.code || null,
    submissionType: sub.submissionType,
    evaluationResult: sub.evaluationResult,
    similarityScore: sub.similarityScore,
    reportedSubscribers: sub.reportedSubscribers,
    caption: sub.caption,
    waSenderName: sub.waSenderName,
    waSenderNumber: sub.waSenderNumber,
    submittedAt: sub.submittedAt,
    imagePath: sub.imagePath,
  };

  // 1. Clear FK trong daily_reports (nếu có)
  await prisma.dailyReport.updateMany({
    where: { startSubmissionId: id },
    data: { startSubmissionId: null },
  });
  await prisma.dailyReport.updateMany({
    where: { endSubmissionId: id },
    data: { endSubmissionId: null },
  });

  // 2. Delete submission row
  await prisma.submission.delete({ where: { id } });

  // 3. Best-effort xoá file ảnh
  if (sub.imagePath) {
    try {
      await unlink(sub.imagePath);
    } catch (e) {
      console.warn(
        `[delete] không xoá được file ${sub.imagePath}: ${(e as Error).message}`,
      );
    }
  }

  await audit({
    userId,
    action: 'submission.delete',
    entityType: 'submission',
    entityId: id,
    oldValue: snapshot,
  });

  revalidatePath('/dashboard/submissions');
  revalidatePath('/dashboard');

  // Nếu form có redirect_after (gọi từ detail page) → redirect về list
  const redirectTo = String(formData.get('redirect_after') || '');
  if (redirectTo) redirect(redirectTo);
}
