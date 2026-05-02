'use client';
/**
 * Background poller — check submission count mỗi 15s.
 * Khi có submission mới, hiện toast banner + nút "Refresh".
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';

type Props = {
  /** Highest submission id rendered ở SSR ban đầu */
  initialLatestId: number | null;
  intervalMs?: number;
};

export function SubmissionsPoller({ initialLatestId, intervalMs = 15_000 }: Props) {
  const router = useRouter();
  const [newCount, setNewCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [latestKnown, setLatestKnown] = useState(initialLatestId);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const r = await fetch('/api/internal/submission-count', { cache: 'no-store' });
        if (!r.ok) return;
        const data = (await r.json()) as { latestId: number | null };
        if (cancelled || data.latestId == null) return;
        if (latestKnown == null) {
          setLatestKnown(data.latestId);
          return;
        }
        if (data.latestId > latestKnown) {
          setNewCount(data.latestId - latestKnown);
          setDismissed(false);
        }
      } catch {
        // ignore network errors
      }
    }

    timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [latestKnown, intervalMs]);

  if (newCount === 0 || dismissed) return null;

  return (
    <div className="sticky top-4 z-40 mx-auto max-w-2xl rounded-lg border bg-primary text-primary-foreground p-3 shadow-lg flex items-center justify-between gap-3">
      <div className="text-sm font-medium">
        🔔 <strong>{newCount}</strong> submission{newCount > 1 ? 's' : ''} mới
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setNewCount(0);
            setDismissed(false);
            router.refresh();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDismissed(true)}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
