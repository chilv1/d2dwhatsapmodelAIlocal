'use server';
/**
 * Server Actions cho Campaign — create / update / toggle active.
 * Auth check + branch scoping (branch_manager chỉ sửa campaign branch mình).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { writeFile } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireRole, type Role } from '@/lib/rbac';
import { audit } from '@/lib/audit';

function getRoot(): string {
  const cwd = process.cwd();
  return cwd.endsWith('/crm') ? resolve(cwd, '..') : cwd;
}

// Resolve data dir: env DATA_DIR > <root>/data fallback.
function getDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  return resolve(getRoot(), 'data');
}

async function checkBranchScope(
  branchId: number | null,
  session: Awaited<ReturnType<typeof requireRole>>,
) {
  if (session.user.role === 'branch_manager') {
    if (!session.user.branchId) {
      throw new Error('Branch manager chưa được gán chi nhánh');
    }
    if (branchId !== session.user.branchId) {
      throw new Error('Bạn chỉ được tạo/sửa campaign của chi nhánh mình');
    }
  }
}

function parseRequirementsJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed
      .filter((it: any) => it && typeof it.label === 'string' && it.label.trim())
      .map((it: any) => ({
        label: String(it.label).trim(),
        required: Boolean(it.required),
        note: it.note == null || String(it.note).trim() === '' ? null : String(it.note).trim(),
      }));
    return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
  } catch {
    return null;
  }
}

async function saveTemplateFile(file: File, code: string): Promise<string> {
  const ext = extname(file.name) || '.jpg';
  const filename = `template_${code.toLowerCase()}_${randomUUID().slice(0, 8)}${ext}`;
  const templateDir = resolve(getDataDir(), 'templates');
  const templatePath = resolve(templateDir, basename(filename));
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(templatePath, buffer);
  return templatePath;
}

export async function createCampaignAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);

  const code = String(formData.get('code') || '').trim().toUpperCase();
  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const templateRequirements = String(formData.get('template_requirements') || '').trim();
  const requirementsJson = parseRequirementsJson(
    String(formData.get('requirements_json') || ''),
  );
  const targetSubscribers = parseInt(String(formData.get('target_subscribers') || '20'), 10);
  const branchIdStr = String(formData.get('branch_id') || '');
  const branchId = branchIdStr ? parseInt(branchIdStr, 10) : null;
  const file = formData.get('template_image') as File | null;

  if (!code) throw new Error('Mã campaign là bắt buộc');
  if (!name) throw new Error('Tên campaign là bắt buộc');
  if (!file || file.size === 0) throw new Error('Phải upload ảnh template');
  if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh template quá lớn (max 10MB)');

  await checkBranchScope(branchId, session);

  const templatePath = await saveTemplateFile(file, code);

  const campaign = await prisma.campaign.create({
    data: {
      code,
      name,
      description: description || null,
      templateImagePath: templatePath,
      templateRequirements: templateRequirements || null,
      requirementsJson,
      targetSubscribers,
      branchId,
      startDate: new Date(),
      isActive: true,
    },
  });

  await audit({
    userId,
    action: 'campaign.create',
    entityType: 'campaign',
    entityId: campaign.id,
    newValue: { code, name, branchId, targetSubscribers },
  });

  revalidatePath('/dashboard/campaigns');
  revalidatePath('/dashboard');
  redirect(`/dashboard/campaigns/${campaign.id}`);
}

export async function updateCampaignAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);
  const role = session.user.role as Role;

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');

  const cur = await prisma.campaign.findUnique({ where: { id } });
  if (!cur) throw new Error('Campaign not found');

  await checkBranchScope(cur.branchId, session);

  const name = String(formData.get('name') || cur.name).trim();
  const description = String(formData.get('description') || '').trim();
  const templateRequirements = String(
    formData.get('template_requirements') || '',
  ).trim();
  const requirementsJson = parseRequirementsJson(
    String(formData.get('requirements_json') || ''),
  );
  const targetSubscribers = parseInt(
    String(formData.get('target_subscribers') || cur.targetSubscribers),
    10,
  );
  const alertThreshold = parseInt(
    String(formData.get('alert_threshold') || (cur.alertThreshold ?? 50)),
    10,
  );

  // Branch chỉ admin được đổi
  let branchId: number | null = cur.branchId;
  if (role === 'admin') {
    const branchIdStr = String(formData.get('branch_id') || '');
    branchId = branchIdStr ? parseInt(branchIdStr, 10) : null;
  }

  // Tuỳ chọn replace template
  const file = formData.get('template_image') as File | null;
  let templateImagePath = cur.templateImagePath;
  if (file && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Ảnh template quá lớn (max 10MB)');
    }
    templateImagePath = await saveTemplateFile(file, cur.code);
  }

  const oldVal = {
    name: cur.name,
    description: cur.description,
    targetSubscribers: cur.targetSubscribers,
    branchId: cur.branchId,
    templateRequirements: cur.templateRequirements,
    requirementsJson: cur.requirementsJson,
    alertThreshold: cur.alertThreshold,
    templateImagePath: cur.templateImagePath,
  };

  const newVal = {
    name,
    description: description || null,
    templateRequirements: templateRequirements || null,
    requirementsJson,
    targetSubscribers,
    branchId,
    alertThreshold,
    templateImagePath,
  };

  await prisma.campaign.update({ where: { id }, data: newVal });

  await audit({
    userId,
    action: 'campaign.update',
    entityType: 'campaign',
    entityId: id,
    oldValue: oldVal,
    newValue: newVal,
  });

  revalidatePath('/dashboard/campaigns');
  revalidatePath(`/dashboard/campaigns/${id}`);
  revalidatePath('/dashboard');
  redirect(`/dashboard/campaigns/${id}`);
}

export async function toggleCampaignActiveAction(formData: FormData) {
  const session = await requireRole(['admin', 'branch_manager']);
  const userId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');

  const cur = await prisma.campaign.findUnique({ where: { id } });
  if (!cur) throw new Error('Campaign not found');

  await checkBranchScope(cur.branchId, session);

  await prisma.campaign.update({
    where: { id },
    data: { isActive: !cur.isActive },
  });

  await audit({
    userId,
    action: 'campaign.toggle_active',
    entityType: 'campaign',
    entityId: id,
    oldValue: { isActive: cur.isActive },
    newValue: { isActive: !cur.isActive },
  });

  revalidatePath('/dashboard/campaigns');
  revalidatePath(`/dashboard/campaigns/${id}`);
  revalidatePath('/dashboard');
}
