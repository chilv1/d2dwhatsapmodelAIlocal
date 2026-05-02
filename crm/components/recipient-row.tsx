'use client';
import { useState } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Send, Power, Trash2, Pencil, Check, X } from 'lucide-react';

type Recipient = {
  id: number;
  channel: string;
  address: string;
  label: string | null;
  branchId: number | null;
  branch: { code: string; name: string } | null;
  digestDaily: boolean;
  alertReject: boolean;
  isActive: boolean;
};

type Branch = { id: number; code: string; name: string };
type Channels = { telegram: boolean; email: boolean };

type Props = {
  recipient: Recipient;
  branches: Branch[];
  channels: Channels;
  updateAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  testSendAction: (formData: FormData) => Promise<void>;
};

export function RecipientRow({
  recipient: r,
  branches,
  channels,
  updateAction,
  toggleAction,
  deleteAction,
  testSendAction,
}: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={8} className="p-3">
          <form
            action={async (fd) => {
              await updateAction(fd);
              setEditing(false);
            }}
            className="grid gap-3 grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 items-end"
          >
            <input type="hidden" name="id" value={r.id} />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Kênh</label>
              <Select name="channel" defaultValue={r.channel}>
                <option value="email">Email</option>
                <option value="telegram">Telegram</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">Địa chỉ *</label>
              <Input name="address" defaultValue={r.address} required className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Label</label>
              <Input name="label" defaultValue={r.label || ''} placeholder="(tuỳ chọn)" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Chi nhánh</label>
              <Select name="branch_id" defaultValue={r.branchId ? String(r.branchId) : ''}>
                <option value="">— Tất cả —</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.code}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-3 text-xs pt-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="digest_daily"
                  defaultChecked={r.digestDaily}
                  className="h-4 w-4"
                />
                Daily
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="alert_reject"
                  defaultChecked={r.alertReject}
                  className="h-4 w-4"
                />
                Alert
              </label>
            </div>
            <div className="flex gap-1.5 justify-end pt-2">
              <Button type="submit" size="sm">
                <Check className="h-3.5 w-3.5" />
                Lưu
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                <X className="h-3.5 w-3.5" />
                Huỷ
              </Button>
            </div>
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <Badge variant={r.channel === 'telegram' ? 'info' : 'secondary'}>
          {r.channel}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-sm">{r.address}</TableCell>
      <TableCell className="text-sm">{r.label || '—'}</TableCell>
      <TableCell className="text-sm">
        {r.branch ? r.branch.code : <em className="text-muted-foreground">all</em>}
      </TableCell>
      <TableCell className="text-center">{r.digestDaily ? '✓' : '—'}</TableCell>
      <TableCell className="text-center">{r.alertReject ? '✓' : '—'}</TableCell>
      <TableCell>
        {r.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="secondary">Disabled</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1.5 justify-end">
          <form action={testSendAction}>
            <input type="hidden" name="channel" value={r.channel} />
            <input type="hidden" name="address" value={r.address} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              title="Test send"
              disabled={!r.isActive || !channels[r.channel as 'telegram' | 'email']}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Sửa"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <form action={toggleAction}>
            <input type="hidden" name="id" value={r.id} />
            <Button type="submit" size="sm" variant="ghost" title="Toggle active">
              <Power className="h-3.5 w-3.5" />
            </Button>
          </form>
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`Xoá recipient "${r.address}"?`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={r.id} />
            <Button type="submit" size="sm" variant="ghost" title="Xoá">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </form>
        </div>
      </TableCell>
    </TableRow>
  );
}
