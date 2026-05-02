/**
 * Internal endpoint cho client polling — trả số submissions hiện tại.
 * Auth: yêu cầu logged in user (cookie session).
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { submissionScopeWhere } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const where = submissionScopeWhere(session as Parameters<typeof submissionScopeWhere>[0]);
  const [total, latest] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findFirst({
      where,
      orderBy: { id: 'desc' },
      select: { id: true, submittedAt: true },
    }),
  ]);

  return NextResponse.json({
    total,
    latestId: latest?.id ?? null,
    latestAt: latest?.submittedAt?.toISOString() ?? null,
  });
}
