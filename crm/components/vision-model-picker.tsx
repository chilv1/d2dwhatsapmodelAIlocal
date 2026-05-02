'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const PRESETS = [
  { value: '', label: '(env fallback — dùng OPENAI_VISION_MODEL từ .env)' },
  { value: 'gpt-4o', label: 'gpt-4o (recommended — best vision quality)' },
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini (rẻ ~16x nhưng accuracy thấp hơn — đã test)' },
  { value: 'gpt-4-turbo', label: 'gpt-4-turbo (older, legacy)' },
  { value: 'gpt-4.1', label: 'gpt-4.1 (newer, nếu OpenAI đã release)' },
  { value: 'chatgpt-4o-latest', label: 'chatgpt-4o-latest (rolling latest)' },
  { value: '__custom__', label: '— Custom model name —' },
];

type Props = {
  defaultValue: string;
};

export function VisionModelPicker({ defaultValue }: Props) {
  const isPreset = PRESETS.some((p) => p.value === defaultValue);
  const initialMode = !defaultValue ? '' : isPreset ? defaultValue : '__custom__';
  const [mode, setMode] = useState(initialMode);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="model" className="text-sm">
          OpenAI Vision Model
        </Label>
        {defaultValue ? (
          <Badge variant="success" className="text-[10px]">
            Active: {defaultValue}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            env fallback
          </Badge>
        )}
      </div>
      <Select
        id="model"
        name="model"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label || '(none)'}
          </option>
        ))}
      </Select>
      {mode === '__custom__' && (
        <Input
          name="model_custom"
          defaultValue={!isPreset ? defaultValue : ''}
          placeholder="vd: gpt-4o-2024-11-20 hoặc model-id-future"
          className="font-mono text-sm"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Setting này override env <code>OPENAI_VISION_MODEL</code>. Bot pickup model mới
        sau ≤30 giây (không cần restart). Cache đã có với model cũ vẫn dùng được — code
        check key cache độc lập với model.
      </p>
    </div>
  );
}
