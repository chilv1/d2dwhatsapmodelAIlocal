/**
 * Phase D.4: Weekly training alert — promotors có reject_rate > 50% trong 7 ngày qua
 * (min 5 submissions) → notify admin Telegram để xếp lịch training.
 *
 * Cron: gọi mỗi thứ 2 8h sáng từ external scheduler.
 *   curl https://image.bitelbot.com/api/cron/weekly-training-alert?key=$CRON_SECRET
 *
 * Configurable: ?min_subs=N&reject_pct=N (default: min_subs=5, reject_pct=50)
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

  const minSubs = Math.max(1, parseInt(url.searchParams.get('min_subs') || '5', 10));
  const rejectPct = Math.max(1, parseInt(url.searchParams.get('reject_pct') || '50', 10));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  const promotors = await prisma.promotor.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      branch: { select: { code: true, name: true } },
    },
  });

  const candidates: Array<{
    id: number;
    name: string;
    employeeCode: string;
    branch: string;
    total: number;
    rejected: number;
    rejectRate: number;
  }> = [];

  for (const p of promotors) {
    const total = await prisma.submission.count({
      where: { promotorId: p.id, submittedAt: { gte: sevenDaysAgo } },
    });
    if (total < minSubs) continue;

    const rejected = await prisma.submission.count({
      where: {
        promotorId: p.id,
        submittedAt: { gte: sevenDaysAgo },
        evaluationResult: 'rejected',
      },
    });
    const rate = (rejected / total) * 100;
    if (rate >= rejectPct) {
      candidates.push({
        id: p.id,
        name: p.name,
        employeeCode: p.employeeCode,
        branch: p.branch?.code || '—',
        total,
        rejected,
        rejectRate: rate,
      });
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      checked: promotors.length,
      candidates: 0,
      message: 'No promotors flagged for training',
    });
  }

  candidates.sort((a, b) => b.rejectRate - a.rejectRate);

  const recipients = await prisma.notificationRecipient.findMany({
    where: { channel: 'telegram', isActive: true, alertReject: true },
    select: { address: true },
  });
  if (recipients.length === 0) {
    return NextResponse.json({
      candidates: candidates.length,
      alerts_sent: 0,
      error: 'no telegram admins',
    });
  }

  const lines = [
    `🎓 *Training Alert — Promotors cần training*`,
    `Tuần qua, ${candidates.length} promotor(s) có reject rate ≥ ${rejectPct}% (min ${minSubs} subs):`,
    '',
  ];
  for (const c of candidates.slice(0, 15)) {
    lines.push(
      `• *${c.name}* (\`${c.employeeCode}\`) — ${c.branch} — ${c.rejectRate.toFixed(0)}% reject (${c.rejected}/${c.total})`,
    );
  }
  if (candidates.length > 15) lines.push(`... và ${candidates.length - 15} promotors khác`);
  lines.push(
    '',
    '_Mở CRM /dashboard/promotors/leaderboard?sort=rate để xem chi tiết._',
  );
  const text = lines.join('\n');

  let sent = 0;
  for (const r of recipients) {
    const result = await sendTelegram(r.address, text);
    if (result.ok) sent++;
  }

  return NextResponse.json({
    checked: promotors.length,
    candidates: candidates.length,
    alerts_sent: sent,
    threshold: { min_subs: minSubs, reject_pct: rejectPct },
  });
}
