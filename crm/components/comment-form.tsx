'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

type Props = {
  submissionId: number;
  action: (formData: FormData) => Promise<void>;
};

export function CommentForm({ submissionId, action }: Props) {
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setPending(true);
        try {
          await action(fd);
          formRef.current?.reset();
        } finally {
          setPending(false);
        }
      }}
      className="flex gap-2 items-start"
    >
      <input type="hidden" name="submission_id" value={submissionId} />
      <textarea
        name="body"
        rows={2}
        required
        maxLength={2000}
        placeholder="Thêm note nội bộ về submission này..."
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={pending}
      />
      <Button type="submit" size="sm" disabled={pending}>
        <Send className="h-3.5 w-3.5" />
        {pending ? 'Đang gửi...' : 'Gửi'}
      </Button>
    </form>
  );
}
