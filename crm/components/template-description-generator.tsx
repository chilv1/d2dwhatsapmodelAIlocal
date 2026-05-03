'use client';

/**
 * UI: button "Auto-generate description" + textarea + suggested-requirements preview.
 *
 * Flow:
 * 1. User click button → POST /api/campaigns/{id}/generate-description
 * 2. Loading state ~6s
 * 3. Response → fill textarea + show suggested checklist preview
 * 4. User edit textarea nếu cần → submit form (textarea có name="template_description")
 *    sẽ được updateCampaignAction lưu vào DB.
 *
 * Suggested requirements chỉ hiển thị tham khảo — admin tự copy vào CampaignRequirementsEditor
 * (tích hợp tự động trong tương lai).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';

type SuggestedRequirement = {
  label: string;
  required: boolean;
  note: string;
};

type Props = {
  campaignId: number;
  defaultDescription: string;
  generatedAt: Date | null;
  hasTemplate: boolean;
};

export function TemplateDescriptionGenerator({
  campaignId,
  defaultDescription,
  generatedAt,
  hasTemplate,
}: Props) {
  const [description, setDescription] = useState(defaultDescription);
  const [suggested, setSuggested] = useState<SuggestedRequirement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSuggested(null);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/generate-description`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setDescription(json.description);
      setSuggested(json.suggested_requirements || []);
      setElapsed(json.elapsed_ms ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {generatedAt && !elapsed ? (
            <span>
              Generated lần cuối:{' '}
              {new Date(generatedAt).toLocaleString('vi-VN')}
            </span>
          ) : elapsed ? (
            <span className="text-green-600">
              ✓ Generated trong {(elapsed / 1000).toFixed(1)}s
            </span>
          ) : (
            <span>Chưa generate. Click button để AI mô tả template.</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={loading || !hasTemplate}
          title={!hasTemplate ? 'Campaign chưa có template image' : ''}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Đang generate (~6s)…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" />
              {description ? 'Re-generate' : 'Auto-generate từ template'}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <textarea
        name="template_description"
        rows={10}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Mô tả chi tiết template — text này sẽ được dùng làm 'ground truth' khi AI compare ảnh hiện trường, thay cho việc gửi template image mỗi call (~50% token saving)."
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <p className="text-xs text-muted-foreground">
        Edit thoải mái. Lưu khi submit form. {description.length} chars.
      </p>

      {suggested && suggested.length > 0 && (
        <details open className="rounded border bg-muted/30 p-3">
          <summary className="cursor-pointer text-xs font-medium">
            🤖 Suggested checklist ({suggested.length} items) — copy vào editor
            phía dưới nếu muốn
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs">
            {suggested.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={
                    item.required
                      ? 'text-destructive font-medium shrink-0'
                      : 'text-muted-foreground shrink-0'
                  }
                >
                  {item.required ? '🔴' : '⚪'}
                </span>
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-muted-foreground">{item.note}</div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
