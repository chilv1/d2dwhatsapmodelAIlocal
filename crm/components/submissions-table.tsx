'use client';
/**
 * Submissions table client component — checkbox multi-select + thumbnails + bulk actions bar.
 * Filter form + pagination ở server component bao ngoài.
 */
import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ResultBadge, SubmissionTypeBadge } from '@/components/result-badge';
import { DeleteSubmissionButton } from '@/components/delete-submission-button';
import { fileUrl } from '@/lib/files';
import { formatDateTimeShort, gpsLink } from '@/lib/format';
import { MapPin, Image as ImageIcon, Check, X, Trash2 } from 'lucide-react';

type Submission = {
  id: number;
  submittedAt: Date;
  submissionType: string;
  imagePath: string | null;
  similarityScore: number | null;
  evaluationResult: string;
  reportedSubscribers: number | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  visionCached: boolean;
  waSenderName: string | null;
  campaign: { code: string; name: string } | null;
  teamLeader: { name: string } | null;
};

type Props = {
  items: Submission[];
  isAdmin: boolean;
  deleteAction: (formData: FormData) => Promise<void>;
  bulkOverrideAction: (formData: FormData) => Promise<void>;
  bulkDeleteAction: (formData: FormData) => Promise<void>;
};

export function SubmissionsTable({
  items,
  isAdmin,
  deleteAction,
  bulkOverrideAction,
  bulkDeleteAction,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const allIds = useMemo(() => items.map((s) => s.id), [items]);
  const allSelected = items.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkOverride(action: 'approved' | 'rejected') {
    if (selected.size === 0) return;
    const reason = prompt(
      `Lý do ${action === 'approved' ? 'duyệt' : 'từ chối'} ${selected.size} submissions?`,
      action === 'approved' ? 'Bulk approve' : 'Bulk reject',
    );
    if (reason == null) return;
    const fd = new FormData();
    fd.append('ids', Array.from(selected).join(','));
    fd.append('new_result', action);
    fd.append('reason', reason);
    bulkOverrideAction(fd).then(() => setSelected(new Set()));
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Xoá VĨNH VIỄN ${selected.size} submissions? Không thể khôi phục.`)) return;
    const fd = new FormData();
    fd.append('ids', Array.from(selected).join(','));
    bulkDeleteAction(fd).then(() => setSelected(new Set()));
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                className="h-4 w-4 cursor-pointer"
                aria-label="Select all"
              />
            </TableHead>
            <TableHead className="w-[80px]">Ảnh</TableHead>
            <TableHead className="w-[60px]">ID</TableHead>
            <TableHead>Thời gian</TableHead>
            <TableHead>Người gửi</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Loại</TableHead>
            <TableHead className="text-center">Score</TableHead>
            <TableHead>Kết quả</TableHead>
            <TableHead className="text-right">Subs</TableHead>
            <TableHead className="w-[60px]">GPS</TableHead>
            <TableHead className="text-right w-[140px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                Chưa có submission nào khớp bộ lọc.
              </TableCell>
            </TableRow>
          )}
          {items.map((s) => {
            const map = gpsLink(s.gpsLatitude, s.gpsLongitude);
            const thumb = fileUrl(s.imagePath);
            const isSelected = selected.has(s.id);
            return (
              <TableRow key={s.id} className={isSelected ? 'bg-muted/30' : ''}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(s.id)}
                    className="h-4 w-4 cursor-pointer"
                    aria-label={`Select #${s.id}`}
                  />
                </TableCell>
                <TableCell>
                  {thumb ? (
                    <Link href={`/dashboard/submissions/${s.id}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt={`#${s.id}`}
                        loading="lazy"
                        className="h-12 w-16 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    </Link>
                  ) : (
                    <div className="h-12 w-16 rounded border bg-muted/30 flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">#{s.id}</TableCell>
                <TableCell className="text-sm">{formatDateTimeShort(s.submittedAt)}</TableCell>
                <TableCell className="text-sm">
                  {s.waSenderName || s.teamLeader?.name || '—'}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">
                    {s.campaign?.code || (
                      <span className="text-muted-foreground italic">no match</span>
                    )}
                  </div>
                  {s.campaign?.name && (
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {s.campaign.name}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <SubmissionTypeBadge type={s.submissionType} />
                </TableCell>
                <TableCell className="text-center font-mono text-sm">
                  {s.similarityScore ?? '—'}
                  {s.visionCached && (
                    <div className="text-[9px] text-muted-foreground">⚡cached</div>
                  )}
                </TableCell>
                <TableCell>
                  <ResultBadge result={s.evaluationResult} />
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {s.reportedSubscribers ?? '—'}
                </TableCell>
                <TableCell>
                  {map ? (
                    <a
                      href={map}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center"
                    >
                      <MapPin className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1.5 justify-end">
                    {isAdmin && (
                      <DeleteSubmissionButton
                        id={s.id}
                        action={deleteAction}
                        variant="icon"
                      />
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/submissions/${s.id}`}>Xem</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Sticky bulk actions bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 mx-auto mt-4 max-w-3xl shadow-lg rounded-lg border bg-card p-3 flex items-center justify-between gap-3 z-50">
          <div className="text-sm">
            <strong>{selected.size}</strong> selected
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-3 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkOverride('approved')}
              className="text-green-700 border-green-700 hover:bg-green-50"
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkOverride('rejected')}
              className="text-red-700 border-red-700 hover:bg-red-50"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkDelete}
                className="text-destructive border-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
