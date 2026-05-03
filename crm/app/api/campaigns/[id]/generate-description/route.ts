/**
 * POST /api/campaigns/[id]/generate-description
 *
 * Auth: admin + branch_manager (scoped). 1-time call gpt-4o ~$0.02 + ~6s.
 * Returns: { description, suggested_requirements }. Không tự save — admin
 * review/edit trên UI rồi save qua updateCampaignAction.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { generateTemplateDescription } from '@/lib/vision-template-desc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireRole(['admin', 'branch_manager']);
  const role = session.user.role;

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  if (
    role === 'branch_manager' &&
    campaign.branchId !== session.user.branchId
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!campaign.templateImagePath) {
    return NextResponse.json(
      { error: 'Campaign chưa có template image' },
      { status: 400 },
    );
  }

  try {
    const t0 = Date.now();
    const result = await generateTemplateDescription({
      templateImagePath: campaign.templateImagePath,
      campaignName: campaign.name,
    });
    const elapsedMs = Date.now() - t0;

    return NextResponse.json({
      ok: true,
      description: result.description,
      suggested_requirements: result.suggested_requirements,
      elapsed_ms: elapsedMs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
