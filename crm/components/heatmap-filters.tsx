'use client';
/**
 * Heatmap filters — Campaign + Submission Type dropdowns.
 * onChange → cập nhật URL searchParams (preserve days), trigger server re-render.
 */
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui/select';

type Props = {
  campaigns: { code: string; name: string }[];
  selectedCampaign: string;
  selectedType: string;
};

export function HeatmapFilters({ campaigns, selectedCampaign, selectedType }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Select
        value={selectedCampaign}
        onChange={(e) => update('campaign', e.target.value)}
        className="h-9 w-auto min-w-[200px]"
        aria-label="Filter by campaign"
      >
        <option value="">Tất cả campaigns</option>
        {campaigns.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </Select>
      <Select
        value={selectedType}
        onChange={(e) => update('type', e.target.value)}
        className="h-9 w-auto min-w-[140px]"
        aria-label="Filter by submission type"
      >
        <option value="">Tất cả loại</option>
        <option value="campaign_start">Inicio (đầu ngày)</option>
        <option value="campaign_end">Fin (cuối ngày)</option>
      </Select>
    </div>
  );
}
