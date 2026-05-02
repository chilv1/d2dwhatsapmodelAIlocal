import { Badge } from '@/components/ui/badge';

const VARIANT_BY_RESULT: Record<
  string,
  'success' | 'destructive' | 'warning' | 'secondary'
> = {
  approved: 'success',
  rejected: 'destructive',
  needs_review: 'warning',
  pending: 'secondary',
};

const LABEL_BY_RESULT: Record<string, string> = {
  approved: 'Đạt',
  rejected: 'Không đạt',
  needs_review: 'Cần xem',
  pending: 'Đang chờ',
};

export function ResultBadge({ result }: { result: string }) {
  const variant = VARIANT_BY_RESULT[result] || 'secondary';
  const label = LABEL_BY_RESULT[result] || result;
  return <Badge variant={variant}>{label}</Badge>;
}

export function SubmissionTypeBadge({ type }: { type: string }) {
  if (type === 'campaign_start') {
    return <Badge variant="info">Đầu ngày</Badge>;
  }
  if (type === 'campaign_end') {
    return <Badge variant="default">Cuối ngày</Badge>;
  }
  return <Badge variant="secondary">{type}</Badge>;
}
