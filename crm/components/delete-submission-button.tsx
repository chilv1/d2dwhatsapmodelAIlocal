'use client';
/**
 * Delete button cho submission — confirm() trước khi submit.
 * Server action passed qua prop để tránh import chéo client→server.
 */
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  id: number;
  action: (formData: FormData) => Promise<void>;
  variant?: 'icon' | 'text';
  redirectAfter?: string;
};

export function DeleteSubmissionButton({
  id,
  action,
  variant = 'icon',
  redirectAfter,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Xoá vĩnh viễn submission #${id}?\n\nẢnh + record sẽ bị xoá khỏi DB.\nDaily report liên quan vẫn giữ (chỉ clear FK).\nAudit log sẽ ghi lại snapshot.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      {redirectAfter && (
        <input type="hidden" name="redirect_after" value={redirectAfter} />
      )}
      {variant === 'icon' ? (
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          title="Xoá submission (admin)"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ) : (
        <Button type="submit" variant="destructive" size="sm">
          <Trash2 className="h-4 w-4" />
          Xoá submission
        </Button>
      )}
    </form>
  );
}
