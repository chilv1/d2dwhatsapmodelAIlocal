/**
 * Dispatcher — chọn channel theo NotificationRecipient + send + log NotificationLog.
 */
import { prisma } from '@/lib/prisma';
import { sendTelegram, isTelegramConfigured } from './telegram';
import { sendEmail, isEmailConfigured } from './email';

export type DispatchTarget = {
  channel: 'telegram' | 'email';
  address: string;
  branchId?: number | null;
  label?: string | null;
};

export type DispatchResult = {
  channel: 'telegram' | 'email';
  address: string;
  ok: boolean;
  errorMsg?: string;
};

/**
 * Lấy recipients theo điều kiện:
 *   - branchId: nếu null = global, nếu có ID = chỉ recipients của branch đó + global recipients
 *   - notificationKind: 'digest_daily' hoặc 'alert_reject'
 */
export async function getRecipients({
  branchId,
  notificationKind,
}: {
  branchId?: number | null;
  notificationKind: 'digest_daily' | 'alert_reject';
}): Promise<DispatchTarget[]> {
  const recipients = await prisma.notificationRecipient.findMany({
    where: {
      isActive: true,
      ...(notificationKind === 'digest_daily'
        ? { digestDaily: true }
        : { alertReject: true }),
      OR: branchId
        ? [{ branchId: null }, { branchId }]
        : [{ branchId: null }],
    },
  });
  return recipients.map((r) => ({
    channel: r.channel as 'telegram' | 'email',
    address: r.address,
    branchId: r.branchId,
    label: r.label,
  }));
}

/**
 * Gửi 1 notification và ghi log. Fail-soft: cá nhân fail không ảnh hưởng người khác.
 */
export async function dispatchOne({
  target,
  subject,
  body,
  htmlBody,
  triggeredByUserId,
}: {
  target: DispatchTarget;
  subject?: string;
  body: string;
  htmlBody?: string;
  triggeredByUserId?: number | null;
}): Promise<DispatchResult> {
  let result: DispatchResult;

  if (target.channel === 'telegram') {
    const r = await sendTelegram(target.address, body);
    result = {
      channel: 'telegram',
      address: target.address,
      ok: r.ok,
      errorMsg: r.errorMsg,
    };
  } else if (target.channel === 'email') {
    const r = await sendEmail(target.address, subject || 'Telecom Big CRM', body, htmlBody);
    result = {
      channel: 'email',
      address: target.address,
      ok: r.ok,
      errorMsg: r.errorMsg,
    };
  } else {
    result = {
      channel: target.channel,
      address: target.address,
      ok: false,
      errorMsg: `Unknown channel: ${target.channel}`,
    };
  }

  // Log
  await prisma.notificationLog
    .create({
      data: {
        channel: target.channel,
        recipient: target.address,
        subject: subject || null,
        body,
        status: result.ok ? 'sent' : 'failed',
        errorMsg: result.errorMsg || null,
        sentAt: result.ok ? new Date() : null,
        triggeredByUserId: triggeredByUserId ?? null,
      },
    })
    .catch((e) => console.warn('[notify] log fail:', (e as Error).message));

  return result;
}

/**
 * Gửi cùng 1 message tới nhiều recipients.
 */
export async function dispatchMany({
  targets,
  subject,
  body,
  htmlBody,
  triggeredByUserId,
}: {
  targets: DispatchTarget[];
  subject?: string;
  body: string;
  htmlBody?: string;
  triggeredByUserId?: number | null;
}): Promise<DispatchResult[]> {
  return Promise.all(
    targets.map((target) =>
      dispatchOne({ target, subject, body, htmlBody, triggeredByUserId }),
    ),
  );
}

export async function channelStatus(): Promise<{
  telegram: boolean;
  email: boolean;
}> {
  const [telegram, email] = await Promise.all([
    isTelegramConfigured(),
    isEmailConfigured(),
  ]);
  return { telegram, email };
}
