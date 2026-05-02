/**
 * Excel export route — dùng ExcelJS server-side.
 * URL: /api/export/daily-reports?days=30
 *      /api/export/submissions?days=7
 *
 * Auth check + branch scoping.
 */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type SearchParams = Promise<{ days?: string }>;
type RouteParams = Promise<{ type: string }>;

function fromDate(daysParam: string | undefined): Date {
  const days = parseInt(daysParam || '30', 10);
  const d = new Date();
  d.setDate(d.getDate() - (days || 30) + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(
  req: NextRequest,
  { params }: { params: RouteParams },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = (session.user.role || 'viewer') as string;
  const branchId = session.user.branchId;

  const { type } = await params;
  const url = new URL(req.url);
  const daysParam = url.searchParams.get('days') || '30';
  const since = fromDate(daysParam);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Telecom Big CRM';
  wb.created = new Date();

  if (type === 'daily-reports') {
    const reports = await prisma.dailyReport.findMany({
      where: {
        reportDate: { gte: since },
        ...(role === 'branch_manager'
          ? { campaign: { branchId: branchId ?? -1 } }
          : {}),
      },
      orderBy: [{ reportDate: 'desc' }, { campaignId: 'asc' }],
      include: {
        campaign: { include: { branch: true } },
      },
    });

    const ws = wb.addWorksheet('Daily Reports');
    ws.columns = [
      { header: 'Ngày', key: 'date', width: 12 },
      { header: 'Campaign Code', key: 'code', width: 22 },
      { header: 'Campaign Name', key: 'name', width: 35 },
      { header: 'Chi nhánh', key: 'branch', width: 20 },
      { header: 'Thực tế', key: 'actual', width: 10 },
      { header: 'Target', key: 'target', width: 10 },
      { header: '% Đạt', key: 'percent', width: 10 },
      { header: 'Trạng thái', key: 'status', width: 12 },
      { header: 'Tóm tắt', key: 'summary', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD32F2F' },
    };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const r of reports) {
      ws.addRow({
        date: r.reportDate.toISOString().slice(0, 10),
        code: r.campaign?.code || '',
        name: r.campaign?.name || '',
        branch: r.campaign?.branch
          ? `${r.campaign.branch.code} — ${r.campaign.branch.name}`
          : '',
        actual: r.actualSubscribers,
        target: r.targetSubscribers,
        percent: `${r.achievementPercent?.toFixed(0) || 0}%`,
        status: r.achieved ? 'ĐẠT' : 'CHƯA ĐẠT',
        summary: r.summary || '',
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="daily_reports_${daysParam}days_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  if (type === 'submissions') {
    const subs = await prisma.submission.findMany({
      where: {
        submittedAt: { gte: since },
        ...(role === 'branch_manager'
          ? { campaign: { branchId: branchId ?? -1 } }
          : {}),
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        campaign: { include: { branch: true } },
        promotor: true,
        teamLeader: true,
        overrideUser: { select: { name: true } },
      },
    });

    const ws = wb.addWorksheet('Submissions');
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Thời gian', key: 'time', width: 18 },
      { header: 'Người gửi WA', key: 'sender', width: 22 },
      { header: 'Promotor', key: 'promotor', width: 22 },
      { header: 'Campaign', key: 'campaign', width: 22 },
      { header: 'Chi nhánh', key: 'branch', width: 20 },
      { header: 'Loại', key: 'type', width: 14 },
      { header: 'Score AI', key: 'score', width: 10 },
      { header: 'Kết quả', key: 'result', width: 12 },
      { header: 'Override?', key: 'override', width: 12 },
      { header: 'Override bởi', key: 'overrideBy', width: 18 },
      { header: 'Subs báo cáo', key: 'subs', width: 12 },
      { header: 'GPS', key: 'gps', width: 22 },
      { header: 'AI feedback', key: 'feedback', width: 50 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD32F2F' },
    };

    for (const s of subs) {
      ws.addRow({
        id: s.id,
        time: s.submittedAt.toISOString().replace('T', ' ').slice(0, 19),
        sender: s.waSenderName || s.teamLeader?.name || '',
        promotor: s.promotor ? `${s.promotor.name} (${s.promotor.employeeCode})` : '',
        campaign: s.campaign?.code || '',
        branch: s.campaign?.branch?.code || '',
        type: s.submissionType === 'campaign_start' ? 'Đầu ngày' : 'Cuối ngày',
        score: s.similarityScore ?? '',
        result: s.evaluationResult,
        override: s.manualOverride || '',
        overrideBy: s.overrideUser?.name || '',
        subs: s.reportedSubscribers ?? '',
        gps:
          s.gpsLatitude != null && s.gpsLongitude != null
            ? `${s.gpsLatitude}, ${s.gpsLongitude}`
            : '',
        feedback: s.aiFeedback || '',
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="submissions_${daysParam}days_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  return NextResponse.json(
    { error: `Unknown export type: ${type}. Valid: daily-reports, submissions` },
    { status: 400 },
  );
}
