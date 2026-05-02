/**
 * Database access layer dùng Prisma Client.
 * Tất cả helpers async, throw khi lỗi (caller xử lý).
 *
 * Schema: ../../prisma/schema.prisma (single source of truth, share với CRM).
 */
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

// Đảm bảo Prisma đọc đúng DB path bất kể cwd nào
process.env.DATABASE_URL = `file:${config.dbPath}`;

export const prisma = new PrismaClient({
  log: config.logLevel === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

// ───────── Helpers ─────────

export async function getOrCreateTeamLeader(waNumber, name = '') {
  return prisma.teamLeader.upsert({
    where: { whatsappNumber: waNumber },
    update: {},
    create: {
      whatsappNumber: waNumber,
      name: name || `Leader-${waNumber.slice(0, 6)}`,
    },
  });
}

export async function findActiveCampaignByCode(code) {
  return prisma.campaign.findFirst({
    where: {
      code: code.toUpperCase(),
      isActive: true,
    },
  });
}

/**
 * @param {object} data Prisma camelCase fields
 */
export async function insertSubmission(data) {
  return prisma.submission.create({ data });
}

export async function findSubmissionByMessageId(waMessageId) {
  return prisma.submission.findUnique({
    where: { waMessageId },
  });
}

export async function findTodayStartSubmission(campaignId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.submission.findFirst({
    where: {
      campaignId,
      submissionType: 'campaign_start',
      submittedAt: { gte: startOfDay },
    },
    orderBy: { submittedAt: 'desc' },
  });
}

/**
 * Upsert daily report theo (campaignId, reportDate).
 */
export async function upsertDailyReport({
  campaignId,
  reportDate,           // Date object hoặc 'YYYY-MM-DD'
  actualSubscribers,
  targetSubscribers,
  startSubmissionId,
  endSubmissionId,
}) {
  const dateObj =
    reportDate instanceof Date ? reportDate : new Date(`${reportDate}T00:00:00`);
  const achieved = actualSubscribers >= targetSubscribers;
  const percent = targetSubscribers
    ? (actualSubscribers / targetSubscribers) * 100
    : 0;
  const summary =
    `${actualSubscribers}/${targetSubscribers} thuê bao (${percent.toFixed(0)}%) - ` +
    `${achieved ? 'ĐẠT' : 'CHƯA ĐẠT'}`;

  return prisma.dailyReport.upsert({
    where: {
      uq_campaign_date: {
        campaignId,
        reportDate: dateObj,
      },
    },
    update: {
      actualSubscribers,
      targetSubscribers,
      achieved,
      achievementPercent: percent,
      endSubmissionId,
      // Chỉ set startSubmissionId nếu chưa có
      ...(startSubmissionId !== undefined && startSubmissionId !== null
        ? { startSubmissionId }
        : {}),
      summary,
    },
    create: {
      campaignId,
      reportDate: dateObj,
      actualSubscribers,
      targetSubscribers,
      achieved,
      achievementPercent: percent,
      startSubmissionId,
      endSubmissionId,
      summary,
    },
  });
}

/**
 * Liệt kê campaign đang hoạt động (cho lệnh STATUS).
 */
export async function listActiveCampaigns(limit = 10) {
  return prisma.campaign.findMany({
    where: { isActive: true },
    select: { code: true, name: true, targetSubscribers: true },
    take: limit,
    orderBy: { id: 'asc' },
  });
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
