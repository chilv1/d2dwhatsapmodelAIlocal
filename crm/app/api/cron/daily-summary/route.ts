/**
 * Cron endpoint — POST/GET với ?key=$CRON_SECRET sẽ tổng kết hôm nay
 * và gửi cho tất cả recipients có digest_daily=true.
 *
 * Setup tự động:
 *   macOS launchd:  schedule curl mỗi 18:00 (Lima time)
 *   Linux cron:     0 18 * * *  curl ".../api/cron/daily-summary?key=..."
 *   GitHub Actions: schedule trigger
 *
 * Auth: query param `key` phải khớp env CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { buildDigestData, digestMarkdown, digestText, digestHtml } from '@/lib/notify/digest';
import { getRecipients, dispatchMany } from '@/lib/notify/dispatcher';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return runDigest(req);
}

export async function POST(req: NextRequest) {
  return runDigest(req);
}

async function runDigest(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  const expected = process.env.CRON_SECRET;

  if (!expected || expected === 'changeme-cron-secret') {
    return NextResponse.json(
      { error: 'CRON_SECRET chưa cấu hình trên server' },
      { status: 500 },
    );
  }
  if (key !== expected) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 });
  }

  // Build digest (global, không scope branch — sẽ filter ở dispatch)
  const digest = await buildDigestData();
  const md = digestMarkdown(digest);
  const txt = digestText(digest);
  const html = digestHtml(digest);
  const subject = `[Telecom Big CRM] Daily Digest — ${digest.date}`;

  // Gửi cho global recipients (branchId=null, digest_daily=true)
  const recipients = await getRecipients({ notificationKind: 'digest_daily' });
  const results = await dispatchMany({
    targets: recipients,
    subject,
    body: md,
    htmlBody: html,
  });

  // Per-branch digest: gom theo branchId, gửi
  const branchScopedRecipients = recipients.filter((r) => r.branchId);
  const byBranch = new Map<number, typeof recipients>();
  for (const r of branchScopedRecipients) {
    if (r.branchId == null) continue;
    if (!byBranch.has(r.branchId)) byBranch.set(r.branchId, []);
    byBranch.get(r.branchId)!.push(r);
  }
  for (const [branchId, branchRecips] of byBranch.entries()) {
    const branchDigest = await buildDigestData(branchId);
    const branchMd = digestMarkdown(branchDigest);
    const branchHtml = digestHtml(branchDigest);
    const branchResults = await dispatchMany({
      targets: branchRecips,
      subject: `[Telecom Big CRM][Branch ${branchId}] Daily Digest`,
      body: branchMd,
      htmlBody: branchHtml,
    });
    results.push(...branchResults);
  }

  // Suppress unused var
  void txt;

  const sentCount = results.filter((r) => r.ok).length;
  const failedCount = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    date: digest.date,
    summary: {
      total_campaigns: digest.totalCampaigns,
      achieved: digest.achievedCount,
      total_actual: digest.totalActual,
      total_target: digest.totalTarget,
    },
    sent: sentCount,
    failed: failedCount,
    results: results.map((r) => ({
      channel: r.channel,
      address: r.address,
      ok: r.ok,
      error: r.errorMsg,
    })),
  });
}
