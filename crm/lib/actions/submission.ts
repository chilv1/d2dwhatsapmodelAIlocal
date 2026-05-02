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
  // Phase C.4: track firstReviewedAt cho SLA computation
  const curRecord = await prisma.submission.findUnique({
    where: { id },
    select: { firstReviewedAt: true },
  });
  await prisma.submission.update({
    where: { id },
    data: {
      manualOverride: isClear ? null : newResult,
      overrideUserId: isClear ? null : userId,
      overrideReason: isClear ? null : reason,
      overriddenAt: isClear ? null : new Date(),
      evaluationResult: isClear ? cur.evaluationResult : newResult,
      ...(curRecord?.firstReviewedAt ? {} : { firstReviewedAt: new Date() }),
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

/**
 * Bulk override (approve/reject) nhiều submissions cùng lúc.
 * @param formData ids: comma-separated ids; new_result: approved|rejected; reason
 */
export async function bulkOverrideAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);

  const idsRaw = String(formData.get('ids') || '');
  const ids = idsRaw
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  const newResult = String(formData.get('new_result') || '').trim();
  const reason = String(formData.get('reason') || '').trim() || 'Bulk action';

  if (ids.length === 0) throw new Error('Chưa chọn submission nào');
  if (!['approved', 'rejected'].includes(newResult)) {
    throw new Error('new_result phải là approved hoặc rejected');
  }

  const subs = await prisma.submission.findMany({
    where: { id: { in: ids } },
    select: { id: true, campaignId: true, evaluationResult: true },
  });

  // Branch scoping
  let allowedIds = subs.map((s) => s.id);
  if (session.user.role === 'branch_manager') {
    const camps = await prisma.campaign.findMany({
      where: { id: { in: subs.map((s) => s.campaignId).filter((x): x is number => !!x) } },
      select: { id: true, branchId: true },
    });
    const allowedCampaignIds = new Set(
      camps.filter((c) => c.branchId === session.user.branchId).map((c) => c.id),
    );
    allowedIds = subs
      .filter((s) => s.campaignId && allowedCampaignIds.has(s.campaignId))
      .map((s) => s.id);
  }

  if (allowedIds.length === 0) {
    throw new Error('Không có submission nào trong scope của bạn');
  }

  await prisma.submission.updateMany({
    where: { id: { in: allowedIds } },
    data: {
      manualOverride: newResult,
      overrideUserId: userId,
      overrideReason: reason,
      overriddenAt: new Date(),
      evaluationResult: newResult,
    },
  });

  await audit({
    userId,
    action: 'submission.bulk_override',
    entityType: 'submission',
    newValue: { ids: allowedIds, newResult, reason, count: allowedIds.length },
  });

  revalidatePath('/dashboard/submissions');
  revalidatePath('/dashboard');
}

/**
 * Bulk delete (admin only).
 */
export async function bulkDeleteAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const idsRaw = String(formData.get('ids') || '');
  const ids = idsRaw
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));

  if (ids.length === 0) throw new Error('Chưa chọn submission nào');

  const subs = await prisma.submission.findMany({
    where: { id: { in: ids } },
    select: { id: true, imagePath: true },
  });

  // Clear FK trong daily_reports
  await prisma.dailyReport.updateMany({
    where: { startSubmissionId: { in: ids } },
    data: { startSubmissionId: null },
  });
  await prisma.dailyReport.updateMany({
    where: { endSubmissionId: { in: ids } },
    data: { endSubmissionId: null },
  });

  await prisma.submission.deleteMany({ where: { id: { in: ids } } });

  // Best-effort xoá files
  for (const s of subs) {
    if (s.imagePath) {
      unlink(s.imagePath).catch(() => {});
    }
  }

  await audit({
    userId,
    action: 'submission.bulk_delete',
    entityType: 'submission',
    oldValue: { ids, count: ids.length },
  });

  revalidatePath('/dashboard/submissions');
  revalidatePath('/dashboard');
}

/**
 * Phase B.3: Add comment/note vào submission. Tự động set firstReviewedAt nếu chưa có.
 */
export async function addCommentAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager', 'viewer']);
  const userId = parseInt(session.user.id, 10);

  const submissionId = parseInt(String(formData.get('submission_id') || ''), 10);
  const body = String(formData.get('body') || '').trim();

  if (Number.isNaN(submissionId)) throw new Error('Bad submission_id');
  if (!body) throw new Error('Comment body là bắt buộc');
  if (body.length > 2000) throw new Error('Comment quá dài (max 2000 chars)');

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { firstReviewedAt: true, campaignId: true },
  });
  if (!sub) throw new Error('Submission not found');

  // Branch scope cho branch_manager
  if (session.user.role === 'branch_manager' && sub.campaignId) {
    const camp = await prisma.campaign.findUnique({
      where: { id: sub.campaignId },
      select: { branchId: true },
    });
    if (camp?.branchId !== session.user.branchId) {
      throw new Error('Không có quyền comment submission của chi nhánh khác');
    }
  }

  await prisma.submissionComment.create({
    data: { submissionId, userId, body },
  });

  // Set firstReviewedAt nếu đây là review action đầu tiên
  if (!sub.firstReviewedAt) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { firstReviewedAt: new Date() },
    });
  }

  await audit({
    userId,
    action: 'submission.comment_add',
    entityType: 'submission',
    entityId: submissionId,
    newValue: { body: body.slice(0, 200) },
  });

  revalidatePath(`/dashboard/submissions/${submissionId}`);
}

/**
 * Phase B.3: Delete comment (admin only OR own comment).
 */
export async function deleteCommentAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager', 'viewer']);
  const userId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');

  const cmt = await prisma.submissionComment.findUnique({ where: { id } });
  if (!cmt) return;

  // Auth: admin xoá được mọi comment, others chỉ xoá comment của mình
  if (session.user.role !== 'admin' && cmt.userId !== userId) {
    throw new Error('Bạn chỉ xoá được comment của chính mình');
  }

  await prisma.submissionComment.delete({ where: { id } });

  await audit({
    userId,
    action: 'submission.comment_delete',
    entityType: 'submission',
    entityId: cmt.submissionId,
    oldValue: { commentId: id, body: cmt.body.slice(0, 200) },
  });

  revalidatePath(`/dashboard/submissions/${cmt.submissionId}`);
}
