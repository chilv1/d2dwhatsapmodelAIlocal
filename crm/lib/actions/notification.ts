'use server';
/**
 * Server Actions cho notification — admin only.
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { dispatchOne, type DispatchTarget } from '@/lib/notify/dispatcher';

export async function addRecipientAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const channel = String(formData.get('channel') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const label = String(formData.get('label') || '').trim() || null;
  const branchIdStr = String(formData.get('branch_id') || '');
  const branchId = branchIdStr ? parseInt(branchIdStr, 10) : null;
  const digestDaily = formData.get('digest_daily') === 'on';
  const alertReject = formData.get('alert_reject') === 'on';

  if (!['telegram', 'email'].includes(channel)) {
    throw new Error('Channel phải là telegram hoặc email');
  }
  if (!address) throw new Error('Địa chỉ là bắt buộc');

  const recipient = await prisma.notificationRecipient.create({
    data: {
      channel,
      address,
      label,
      branchId,
      digestDaily,
      alertReject,
      isActive: true,
    },
  });

  await audit({
    userId,
    action: 'notification.recipient_add',
    entityType: 'notification_recipient',
    entityId: recipient.id,
    newValue: { channel, address, branchId, digestDaily, alertReject },
  });

  revalidatePath('/dashboard/notifications');
}

export async function toggleRecipientActiveAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);
  const id = parseInt(String(formData.get('id') || ''), 10);

  const cur = await prisma.notificationRecipient.findUnique({ where: { id } });
  if (!cur) throw new Error('Recipient not found');

  await prisma.notificationRecipient.update({
    where: { id },
    data: { isActive: !cur.isActive },
  });

  await audit({
    userId,
    action: cur.isActive
      ? 'notification.recipient_disable'
      : 'notification.recipient_enable',
    entityType: 'notification_recipient',
    entityId: id,
  });

  revalidatePath('/dashboard/notifications');
}

export async function deleteRecipientAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);
  const id = parseInt(String(formData.get('id') || ''), 10);

  const cur = await prisma.notificationRecipient.findUnique({ where: { id } });
  if (!cur) return;

  await prisma.notificationRecipient.delete({ where: { id } });

  await audit({
    userId,
    action: 'notification.recipient_delete',
    entityType: 'notification_recipient',
    entityId: id,
    oldValue: { channel: cur.channel, address: cur.address },
  });

  revalidatePath('/dashboard/notifications');
}

/**
 * Test send 1 message tới recipient để verify config.
 */
export async function testSendAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const userId = parseInt(session.user.id, 10);

  const channel = String(formData.get('channel') || '').trim();
  const address = String(formData.get('address') || '').trim();
  if (!['telegram', 'email'].includes(channel)) {
    throw new Error('Channel phải là telegram hoặc email');
  }
  if (!address) throw new Error('Address là bắt buộc');

  const target: DispatchTarget = {
    channel: channel as 'telegram' | 'email',
    address,
  };

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const subject = '[Telecom Big CRM] Test notification';
  const body =
    channel === 'telegram'
      ? `🧪 *Test notification*\n\nNếu bạn thấy tin này, kênh ${channel} đã setup đúng.\n\n_Sent at ${ts}_`
      : `Test notification từ Telecom Big CRM\n\nNếu bạn thấy email này, kênh ${channel} đã setup đúng.\n\nSent at ${ts}`;

  await dispatchOne({
    target,
    subject,
    body,
    triggeredByUserId: userId,
  });

  revalidatePath('/dashboard/notifications');
}

/**
 * Manual trigger digest hôm nay — gửi tới tất cả global recipients (admin)
 * hoặc branch-specific recipients (branch_manager).
 */
export async function sendDigestNowAction() {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);
  const branchId =
    session.user.role === 'branch_manager' ? session.user.branchId ?? null : null;

  const { buildDigestData, digestMarkdown, digestHtml } = await import(
    '@/lib/notify/digest'
  );
  const { getRecipients, dispatchMany } = await import('@/lib/notify/dispatcher');

  const digest = await buildDigestData(branchId);
  const md = digestMarkdown(digest);
  const html = digestHtml(digest);
  const subject = `[Telecom Big CRM] Daily Digest — ${digest.date}`;

  const recipients = await getRecipients({
    branchId,
    notificationKind: 'digest_daily',
  });
  const results = await dispatchMany({
    targets: recipients,
    subject,
    body: md,
    htmlBody: html,
    triggeredByUserId: userId,
  });

  await audit({
    userId,
    action: 'notification.send_digest_now',
    entityType: 'notification',
    newValue: {
      recipients: recipients.length,
      sent: results.filter((r) => r.ok).length,
    },
  });

  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard/reports');
}
