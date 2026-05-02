/**
 * Audit log helper — ghi mọi action quan trọng vào audit_logs.
 * Fail-soft: nếu audit insert lỗi, log warning nhưng không throw để không block action chính.
 */
import { prisma } from '@/lib/prisma';

export type AuditInput = {
  userId?: number | null;
  action: string;            // 'campaign.create' | 'submission.override' | 'user.login' | ...
  entityType?: string | null;
  entityId?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
};

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
        newValue: input.newValue ? JSON.stringify(input.newValue) : null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (e) {
    console.warn('[audit] insert failed:', (e as Error).message);
  }
}

/**
 * Action type → label tiếng Việt cho UI timeline.
 */
export const ACTION_LABELS: Record<string, string> = {
  'user.login': 'Đăng nhập',
  'user.create': 'Tạo user mới',
  'user.update': 'Cập nhật user',
  'user.deactivate': 'Vô hiệu hoá user',
  'user.reactivate': 'Kích hoạt user',
  'user.password_reset': 'Đặt lại mật khẩu',
  'campaign.create': 'Tạo campaign',
  'campaign.update': 'Cập nhật campaign',
  'campaign.toggle_active': 'Bật/tắt campaign',
  'submission.override': 'Override AI verdict',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}
