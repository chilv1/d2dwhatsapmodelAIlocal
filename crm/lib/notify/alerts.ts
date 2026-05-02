/**
 * Realtime alert helper — gửi cảnh báo khi reject rate vượt threshold.
 * Gọi sau khi 1 submission được tạo / override với verdict 'rejected'.
 *
 * Logic:
 *   1. Lấy threshold từ campaign.alertThreshold (% reject trong ngày, default 50)
 *   2. Đếm submissions hôm nay của campaign này
 *   3. Tính reject rate
 *   4. Nếu > threshold VÀ chưa alert hôm nay → dispatch
 *
 * Idempotent: kiểm tra notification_logs để không spam (1 alert/ngày/campaign).
 */
import { prisma } from '@/lib/prisma';
import { getRecipients, dispatchMany } from './dispatcher';

export async function checkAndSendRejectAlert(campaignId: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { branch: true },
  });
  if (!campaign) return { triggered: false, reason: 'campaign not found' };

  const threshold = campaign.alertThreshold ?? 50;

  // Đếm submission hôm nay của campaign
  const todaySubs = await prisma.submission.findMany({
    where: { campaignId, submittedAt: { gte: today } },
    select: { evaluationResult: true },
  });
  if (todaySubs.length < 3) {
    // Quá ít data để alert
    return { triggered: false, reason: 'too few submissions' };
  }
  const rejectCount = todaySubs.filter((s) => s.evaluationResult === 'rejected').length;
  const rejectRate = (rejectCount / todaySubs.length) * 100;
  if (rejectRate < threshold) {
    return { triggered: false, reason: `rate ${rejectRate.toFixed(0)}% < ${threshold}%` };
  }

  // Idempotency: kiểm tra đã alert chưa hôm nay
  const recentAlert = await prisma.notificationLog.findFirst({
    where: {
      createdAt: { gte: today },
      subject: { contains: `[ALERT] ${campaign.code}` },
      status: 'sent',
    },
  });
  if (recentAlert) {
    return { triggered: false, reason: 'already alerted today' };
  }

  // Build alert message
  const subject = `[ALERT] ${campaign.code} — Reject rate cao`;
  const body =
    `🚨 *CẢNH BÁO* — Campaign \`${campaign.code}\`\n\n` +
    `Tỉ lệ reject hôm nay: *${rejectRate.toFixed(0)}%* (${rejectCount}/${todaySubs.length})\n` +
    `Vượt threshold ${threshold}% — cần kiểm tra ngay.\n\n` +
    `Chi nhánh: ${campaign.branch?.code || 'N/A'}\n` +
    `Campaign: ${campaign.name}\n\n` +
    `_Sent by Telecom Big CRM_`;

  // Gửi cho recipients có alert_reject = true (global + branch của campaign)
  const recipients = await getRecipients({
    branchId: campaign.branchId,
    notificationKind: 'alert_reject',
  });

  if (recipients.length === 0) {
    return { triggered: false, reason: 'no recipients configured' };
  }

  const results = await dispatchMany({
    targets: recipients,
    subject,
    body,
  });
  const sentCount = results.filter((r) => r.ok).length;

  return {
    triggered: true,
    rejectRate,
    threshold,
    recipientCount: recipients.length,
    sentCount,
  };
}
