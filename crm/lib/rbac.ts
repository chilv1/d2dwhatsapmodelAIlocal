/**
 * RBAC helpers — role check + branch scoping.
 * 3 roles:
 *   - admin           : full access
 *   - branch_manager  : chỉ thấy data thuộc branchId của mình
 *   - viewer          : read-only mọi data, không tạo/sửa/xoá
 */
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '@/auth';

export type Role = 'admin' | 'branch_manager' | 'viewer';
export type { Session };

export const ROLES: Role[] = ['admin', 'branch_manager', 'viewer'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  branch_manager: 'Quản lý chi nhánh',
  viewer: 'Xem',
};

/**
 * Đảm bảo có session, redirect /login nếu chưa.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session;
}

/**
 * Đảm bảo user có role nằm trong allowedRoles, không thì 403.
 */
export async function requireRole(allowedRoles: Role[]) {
  const session = await requireSession();
  const role = (session.user.role || 'viewer') as Role;
  if (!allowedRoles.includes(role)) {
    redirect('/dashboard?error=forbidden');
  }
  return session;
}

/**
 * Build Prisma where clause cho Submission tuỳ theo role:
 *   - admin / viewer  : thấy tất cả
 *   - branch_manager  : chỉ thấy submission của campaign thuộc branch mình
 */
export function submissionScopeWhere(session: Session): Record<string, unknown> {
  const role = session.user.role as Role;
  if (role !== 'branch_manager') return {};
  if (!session.user.branchId) {
    // branch_manager chưa được gán chi nhánh → không thấy gì
    return { id: -1 };
  }
  return { campaign: { branchId: session.user.branchId } };
}

/**
 * Build Prisma where clause cho Campaign tuỳ theo role.
 */
export function campaignScopeWhere(session: Session): Record<string, unknown> {
  const role = session.user.role as Role;
  if (role !== 'branch_manager') return {};
  if (!session.user.branchId) return { id: -1 };
  return { branchId: session.user.branchId };
}

export function isAdmin(session: Session): boolean {
  return session.user.role === 'admin';
}

export function canWrite(session: Session): boolean {
  // Viewer = read-only. Admin và branch_manager có quyền write.
  return session.user.role !== 'viewer';
}
