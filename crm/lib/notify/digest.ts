/**
 * Build daily digest message — Markdown for Telegram + plain text + HTML for email.
 */
import { prisma } from '@/lib/prisma';

export type DigestData = {
  date: string;
  totalCampaigns: number;
  achievedCount: number;
  totalActual: number;
  totalTarget: number;
  reports: {
    code: string;
    name: string;
    branch: string;
    actual: number;
    target: number;
    percent: number;
    achieved: boolean;
  }[];
  topPromotors: { name: string; employeeCode: string; approved: number; total: number }[];
};

export async function buildDigestData(branchId?: number | null): Promise<DigestData> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reportWhere = branchId
    ? { reportDate: today, campaign: { branchId } }
    : { reportDate: today };

  const reports = await prisma.dailyReport.findMany({
    where: reportWhere,
    include: { campaign: { include: { branch: true } } },
    orderBy: [{ achieved: 'desc' }, { achievementPercent: 'desc' }],
  });

  const topPromotors = await prisma.promotor
    .findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        _count: {
          select: {
            submissions: {
              where: { submittedAt: { gte: today } },
            },
          },
        },
      },
    })
    .then((promos) =>
      promos
        .filter((p) => p._count.submissions > 0)
        .map((p) => ({
          name: p.name,
          employeeCode: p.employeeCode,
          total: p._count.submissions,
        })),
    );

  // Get approved counts
  const approved = await prisma.submission.groupBy({
    by: ['promotorId'],
    _count: { _all: true },
    where: {
      submittedAt: { gte: today },
      evaluationResult: 'approved',
      promotorId: { not: null },
    },
  });
  const approvedMap = new Map(approved.map((a) => [a.promotorId, a._count._all]));

  const ranked = topPromotors
    .map((p) => ({
      ...p,
      approved: approvedMap.get(
        topPromotors.find((x) => x.employeeCode === p.employeeCode)
          ? approvedMap.get(0) || 0
          : 0,
      ) || 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Better: properly link by id (re-fetch with id)
  const promosWithId = await prisma.promotor.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      submissions: { some: { submittedAt: { gte: today } } },
    },
    select: { id: true, name: true, employeeCode: true },
  });
  const finalRanked = await Promise.all(
    promosWithId.map(async (p) => {
      const total = await prisma.submission.count({
        where: { promotorId: p.id, submittedAt: { gte: today } },
      });
      const ap = await prisma.submission.count({
        where: {
          promotorId: p.id,
          submittedAt: { gte: today },
          evaluationResult: 'approved',
        },
      });
      return { name: p.name, employeeCode: p.employeeCode, total, approved: ap };
    }),
  );
  finalRanked.sort((a, b) => b.approved - a.approved || b.total - a.total);

  // Suppress unused variable warning
  void ranked;

  return {
    date: today.toISOString().slice(0, 10),
    totalCampaigns: reports.length,
    achievedCount: reports.filter((r) => r.achieved).length,
    totalActual: reports.reduce((s, r) => s + r.actualSubscribers, 0),
    totalTarget: reports.reduce((s, r) => s + r.targetSubscribers, 0),
    reports: reports.map((r) => ({
      code: r.campaign?.code || '',
      name: r.campaign?.name || '',
      branch: r.campaign?.branch?.code || '—',
      actual: r.actualSubscribers,
      target: r.targetSubscribers,
      percent: r.achievementPercent || 0,
      achieved: r.achieved,
    })),
    topPromotors: finalRanked.slice(0, 5),
  };
}

// Escape Telegram Markdown V1 special chars (_, *, `, [)
// Cần thiết vì campaign code như "MERCADO_01" có dấu _ khiến Telegram parse italic và lỗi.
function mdEscape(s: string | null | undefined): string {
  return String(s ?? '').replace(/([_*`[])/g, '\\$1');
}

/**
 * Format thành Telegram-friendly Markdown.
 */
export function digestMarkdown(d: DigestData): string {
  const overallRate = d.totalTarget > 0
    ? ((d.totalActual / d.totalTarget) * 100).toFixed(0)
    : '0';

  const lines = [
    `📊 *Daily Digest — ${mdEscape(d.date)}*`,
    '',
    `*Tổng quan:* ${d.achievedCount}/${d.totalCampaigns} campaign ĐẠT mục tiêu`,
    `*Thuê bao:* ${d.totalActual}/${d.totalTarget} (${overallRate}%)`,
  ];

  if (d.reports.length > 0) {
    lines.push('', '*Chi tiết theo campaign:*');
    for (const r of d.reports.slice(0, 10)) {
      const icon = r.achieved ? '✅' : '⚠️';
      lines.push(
        `${icon} ${mdEscape(r.code)} (${mdEscape(r.branch)}) — ${r.actual}/${r.target} (${r.percent.toFixed(0)}%)`,
      );
    }
  }

  if (d.topPromotors.length > 0) {
    lines.push('', '*Top promotors hôm nay:*');
    for (let i = 0; i < d.topPromotors.length; i++) {
      const p = d.topPromotors[i];
      lines.push(`${i + 1}. ${mdEscape(p.name)} (${mdEscape(p.employeeCode)}) — ${p.approved}/${p.total} đạt`);
    }
  }

  if (d.reports.length === 0) {
    lines.push('', '_Chưa có report nào hôm nay._');
  }

  lines.push('', `_Generated by Telecom Big CRM_`);
  return lines.join('\n');
}

/**
 * Format thành plain text (cho email subject + body).
 */
export function digestText(d: DigestData): string {
  return digestMarkdown(d).replace(/\*/g, '').replace(/_/g, '');
}

export function digestHtml(d: DigestData): string {
  const overallRate = d.totalTarget > 0
    ? ((d.totalActual / d.totalTarget) * 100).toFixed(0)
    : '0';
  const rows = d.reports
    .slice(0, 20)
    .map(
      (r) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.achieved ? '✅' : '⚠️'} <code>${r.code}</code></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;">${r.branch}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${r.actual}/${r.target}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${r.percent.toFixed(0)}%</td>
      </tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#333;">
  <h2 style="color:#d32f2f;margin:0 0 8px;">📊 Daily Digest — ${d.date}</h2>
  <p style="color:#666;margin:0 0 16px;">${d.achievedCount}/${d.totalCampaigns} campaign ĐẠT · ${d.totalActual}/${d.totalTarget} thuê bao (${overallRate}%)</p>
  ${d.reports.length === 0 ? '<p><em>Chưa có report nào hôm nay.</em></p>' : `
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:#f5f5f5;">
      <th style="padding:8px 10px;text-align:left;">Campaign</th>
      <th style="padding:8px 10px;text-align:left;">Chi nhánh</th>
      <th style="padding:8px 10px;text-align:right;">Subs</th>
      <th style="padding:8px 10px;text-align:right;">%</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`}
  <p style="margin-top:24px;color:#999;font-size:12px;">Generated by Telecom Big CRM</p>
</body></html>`;
}
