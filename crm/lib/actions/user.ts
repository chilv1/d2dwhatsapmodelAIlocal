'use server';
/**
 * Server Actions cho User management — admin only.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRole, ROLES, type Role } from '@/lib/rbac';
import { audit } from '@/lib/audit';

export async function createUserAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const adminId = parseInt(session.user.id, 10);

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const name = String(formData.get('name') || '').trim();
  const role = String(formData.get('role') || 'viewer');
  const branchIdStr = String(formData.get('branch_id') || '');
  const branchId = branchIdStr ? parseInt(branchIdStr, 10) : null;
  const password = String(formData.get('password') || '');

  if (!email || !name || !password) {
    throw new Error('Email, tên, mật khẩu là bắt buộc');
  }
  if (!ROLES.includes(role as Role)) throw new Error('Role không hợp lệ');
  if (password.length < 6) throw new Error('Mật khẩu phải ≥ 6 ký tự');

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      branchId: role === 'branch_manager' ? branchId : null,
      passwordHash,
      isActive: true,
    },
  });

  await audit({
    userId: adminId,
    action: 'user.create',
    entityType: 'user',
    entityId: user.id,
    newValue: { email: user.email, name: user.name, role: user.role, branchId: user.branchId },
  });

  revalidatePath('/dashboard/users');
  redirect(`/dashboard/users/${user.id}`);
}

export async function updateUserAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const adminId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');

  const cur = await prisma.user.findUnique({ where: { id } });
  if (!cur) throw new Error('User not found');

  const name = String(formData.get('name') || cur.name).trim();
  const role = String(formData.get('role') || cur.role);
  const branchIdStr = String(formData.get('branch_id') || '');
  const branchId = branchIdStr ? parseInt(branchIdStr, 10) : null;

  if (!ROLES.includes(role as Role)) throw new Error('Role không hợp lệ');

  const oldVal = { name: cur.name, role: cur.role, branchId: cur.branchId };
  const newVal = {
    name,
    role,
    branchId: role === 'branch_manager' ? branchId : null,
  };

  await prisma.user.update({ where: { id }, data: newVal });

  await audit({
    userId: adminId,
    action: 'user.update',
    entityType: 'user',
    entityId: id,
    oldValue: oldVal,
    newValue: newVal,
  });

  revalidatePath('/dashboard/users');
  revalidatePath(`/dashboard/users/${id}`);
}

export async function toggleUserActiveAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const adminId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  if (Number.isNaN(id)) throw new Error('Bad id');
  if (id === adminId) throw new Error('Không thể tự vô hiệu hoá tài khoản hiện tại');

  const cur = await prisma.user.findUnique({ where: { id } });
  if (!cur) throw new Error('User not found');

  await prisma.user.update({
    where: { id },
    data: { isActive: !cur.isActive },
  });

  await audit({
    userId: adminId,
    action: cur.isActive ? 'user.deactivate' : 'user.reactivate',
    entityType: 'user',
    entityId: id,
    oldValue: { isActive: cur.isActive },
    newValue: { isActive: !cur.isActive },
  });

  revalidatePath('/dashboard/users');
  revalidatePath(`/dashboard/users/${id}`);
}

export async function resetPasswordAction(formData: FormData) {
  const session = await requireRole(['admin']);
  const adminId = parseInt(session.user.id, 10);

  const id = parseInt(String(formData.get('id') || ''), 10);
  const password = String(formData.get('password') || '');
  if (Number.isNaN(id)) throw new Error('Bad id');
  if (password.length < 6) throw new Error('Mật khẩu phải ≥ 6 ký tự');

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  await audit({
    userId: adminId,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: id,
  });

  revalidatePath(`/dashboard/users/${id}`);
}
