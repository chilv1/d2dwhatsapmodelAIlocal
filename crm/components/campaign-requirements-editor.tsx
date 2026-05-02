'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Item = {
  label: string;
  required: boolean;
  note: string;
};

type Props = {
  defaultValue?: string | null;
};

function parseDefault(raw?: string | null): Item[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((it) => it && typeof it.label === 'string')
      .map((it) => ({
        label: String(it.label || ''),
        required: Boolean(it.required),
        note: it.note == null ? '' : String(it.note),
      }));
  } catch {
    return [];
  }
}

export function CampaignRequirementsEditor({ defaultValue }: Props) {
  const [items, setItems] = useState<Item[]>(() => parseDefault(defaultValue));

  const serialized = useMemo(() => {
    const cleaned = items
      .map((it) => ({
        label: it.label.trim(),
        required: it.required,
        note: it.note.trim() || null,
      }))
      .filter((it) => it.label.length > 0);
    return cleaned.length > 0 ? JSON.stringify(cleaned) : '';
  }, [items]);

  function update(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function add() {
    setItems((prev) => [...prev, { label: '', required: true, note: '' }]);
  }

  function remove(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3 rounded-md border border-input bg-background p-3">
      <input type="hidden" name="requirements_json" value={serialized} />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có item nào. Bấm <strong>+ Thêm item</strong> để bắt đầu.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
            <div className="col-span-4">Tên item *</div>
            <div className="col-span-2">Bắt buộc?</div>
            <div className="col-span-5">Mô tả thêm (optional)</div>
            <div className="col-span-1"></div>
          </div>

          {items.map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-md border border-input bg-card p-2 md:grid-cols-12 md:items-center md:p-1"
            >
              <div className="md:col-span-4">
                <Input
                  value={item.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Standee Bipay"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>{item.required ? 'Required' : 'Optional'}</span>
                </label>
              </div>
              <div className="md:col-span-5">
                <Input
                  value={item.note}
                  onChange={(e) => update(i, { note: e.target.value })}
                  placeholder="Mô tả nhận dạng: VD: standee VÀNG có chữ FLASH 49.90, đứng riêng phía trước"
                />
              </div>
              <div className="md:col-span-1 md:text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  aria-label="Xoá item"
                  title="Xoá item"
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          + Thêm item
        </Button>
        <p className="text-xs text-muted-foreground">
          {items.filter((i) => i.label.trim()).length} item · Required:{' '}
          {items.filter((i) => i.required && i.label.trim()).length}
        </p>
      </div>
    </div>
  );
}
