'use client';
/**
 * Helper UI: gọi /api/telegram/chats để liệt kê chat_id user đã /start với bot.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Copy, Check } from 'lucide-react';

type Chat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  firstName?: string;
  lastUpdate: string;
};

export function TelegramChatHelper() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    chats?: Chat[];
    bot?: { username?: string };
    hint?: string;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function fetchChats() {
    setLoading(true);
    try {
      const r = await fetch('/api/telegram/chats');
      const d = await r.json();
      setData(d);
    } catch (e) {
      setData({ error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function copy(id: number) {
    navigator.clipboard.writeText(String(id));
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={fetchChats}
        disabled={loading}
      >
        <Search className="h-3.5 w-3.5" />
        {loading ? 'Đang lấy...' : 'Lấy danh sách Chat ID Telegram'}
      </Button>

      {data?.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
          ❌ {data.error}
        </div>
      )}

      {data?.bot && (
        <div className="text-xs text-muted-foreground">
          Bot:{' '}
          <a
            href={`https://t.me/${data.bot.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-mono"
          >
            @{data.bot.username}
          </a>
        </div>
      )}

      {data?.hint && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          💡 {data.hint}
        </div>
      )}

      {data?.chats && data.chats.length > 0 && (
        <div className="rounded-md border divide-y text-xs">
          {data.chats.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-foreground font-semibold">{c.id}</code>
                  <Badge variant="outline" className="text-[10px]">
                    {c.type}
                  </Badge>
                </div>
                <div className="text-muted-foreground truncate">
                  {c.title || c.firstName || c.username || '—'}
                  {c.username && ` (@${c.username})`}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => copy(c.id)}
                title="Copy chat_id"
              >
                {copied === c.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
