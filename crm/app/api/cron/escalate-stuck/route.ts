/**
 * Phase D.1: Auto-escalation cron — submissions stuck `needs_review`/`pending`
 * > N hours → alert admin Telegram. Throttle bằng escalation_alerted_at flag.
 *
 * Cron: gọi mỗi 30 phút từ external scheduler (vd cron VPS hoặc Vercel cron).
 *   curl https://image.bitelbot.com/api/cron/escalate-stuck?key=$CRON_SECRET
 *
 * Default threshold: 2 giờ. Override via ?hours=N.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegram } from '@/lib/notify/telegram';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const expected = process.env.CRON_SECRET;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Bad key' }, { status: 401 });
  }

  const hours = Math.max(1, parseInt(url.searchParams.get('hours') || '2', 10));
  const cutoff = new Date(Date.now() - hours * 3600_000);

  // Query submissions stuck > N giờ chưa được alert
  const stuck = await prisma.submission.findMany({
    where: {
      evaluationResult: { in: ['needs_review', 'pending'] },
      submittedAt: { lt: cutoff },
      escalationAlertedAt: null,
      manualOverride: null,
    },
    select: {
      id: true,
      submittedAt: true,
      evaluationResult: true,
      qualityFailed: true,
      outOfZone: true,
      campaign: { select: { code: true } },
      waSenderName: true,
    },
    orderBy: { submittedAt: 'asc' },
    take: 50,
  });

  if (stuck.length === 0) {
    return NextResponse.json({ stuck: 0, alerts_sent: 0 });
  }

  // Lấy danh sách admin telegram chats (alert_reject = true)
  const recipients = await prisma.notificationRecipient.findMany({
    where: { channel: 'telegram', isActive: true, alertReject: true },
    select: { address: true },
  });

  if (recipients.length === 0) {
    return NextResponse.json({ stuck: stuck.length, alerts_sent: 0, error: 'no telegram admins' });
  }

  // Build message — group thành 1 alert
  const lines = [
    `🚨 *${stuck.length} submissions stuck > ${hours}h*`,
    '',
  ];
  for (const s of stuck.slice(0, 10)) {
    const ageMin = Math.floor((Date.now() - s.submittedAt.getTime()) / 60_000);
    const tags = [];
    if (s.qualityFailed) tags.push('🖼quality');
    if (s.outOfZone) tags.push('📍out-of-zone');
    tags.push(s.evaluationResult);
    const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
    lines.push(
      `#${s.id} \`${s.campaign?.code || 'no-camp'}\` — ${s.waSenderName || 'anonymous'} — ${ageMin}min${tagStr}`,
    );
  }
  if (stuck.length > 10) {
    lines.push(`... và ${stuck.length - 10} submissions khác`);
  }
  lines.push('', '_Reply `/approve <id>` hoặc `/reject <id> <reason>` từ Telegram để xử lý nhanh._');
  const text = lines.join('\n');

  // Send tới mọi admin chat
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const result = await sendTelegram(r.address, text);
    if (result.ok) sent++;
    else failed++;
  }

  // Mark đã alert (để không spam lại)
  await prisma.submission.updateMany({
    where: { id: { in: stuck.map((s) => s.id) } },
    data: { escalationAlertedAt: new Date() },
  });

  return NextResponse.json({
    stuck: stuck.length,
    alerts_sent: sent,
    alerts_failed: failed,
    threshold_hours: hours,
  });
}
