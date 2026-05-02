/**
 * Notifications page — admin only.
 * - Channel status (Telegram/Email config)
 * - Recipients CRUD (channel + address + branch + flags)
 * - Test send form
 * - Recent logs
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/rbac';
import { channelStatus } from '@/lib/notify/dispatcher';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Bell, Send, Trash2, CheckCircle2, XCircle, Mail, Phone, Power, Save, ChevronRight } from 'lucide-react';
import {
  addRecipientAction,
  updateRecipientAction,
  toggleRecipientActiveAction,
  deleteRecipientAction,
  testSendAction,
} from '@/lib/actions/notification';
import { RecipientRow } from '@/components/recipient-row';
import {
  updateTelegramSettingsAction,
  updateSmtpSettingsAction,
} from '@/lib/actions/settings';
import { getTelegramConfig, getSmtpConfig } from '@/lib/settings';
import { TelegramChatHelper } from '@/components/telegram-chat-helper';

const PASSWORD_PLACEHOLDER = '__keep__';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  await requireRole(['admin']);

  const [recipients, branches, recentLogs, channels, telegramCfg, smtpCfg] =
    await Promise.all([
      prisma.notificationRecipient.findMany({
        include: { branch: { select: { code: true, name: true } } },
        orderBy: [{ isActive: 'desc' }, { channel: 'asc' }, { id: 'desc' }],
      }),
      prisma.branch.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      prisma.notificationLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { triggeredBy: { select: { name: true } } },
      }),
      channelStatus(),
      getTelegramConfig(),
      getSmtpConfig(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-7 w-7" />
          Notifications
        </h1>
        <p className="text-muted-foreground mt-1">
          Cấu hình recipient và xem lịch sử gửi notification (Telegram + Email).
        </p>
      </div>

      {/* Channel config — Telegram + SMTP forms */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Telegram */}
        <Card>
          <details className="group">
            <summary className="cursor-pointer list-none p-6 hover:bg-accent/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90 text-muted-foreground" />
                  <Phone className="h-4 w-4" />
                  <span className="text-base font-semibold">Telegram</span>
                </div>
                {channels.telegram ? (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Đã cấu hình
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Chưa cấu hình
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 ml-6">
                Click để xem/sửa cấu hình. Mặc định đóng để bảo mật.
              </p>
            </summary>
            <div className="px-6 pb-6 space-y-3">
              <p className="text-xs text-muted-foreground">
                Tạo bot qua{' '}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  @BotFather
                </a>{' '}
                → copy token → paste dưới đây.
              </p>
              <form action={updateTelegramSettingsAction} className="space-y-3" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="bot_token" className="text-xs">
                  Bot Token <span className="text-muted-foreground">(format: số:chuỗi)</span>
                </Label>
                <Input
                  id="bot_token"
                  name="bot_token"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  className="font-mono text-xs"
                  placeholder={
                    telegramCfg.botToken
                      ? '••••••••••••••••••••• (đang có, để trống = giữ nguyên)'
                      : '123456789:AAH...'
                  }
                  defaultValue={telegramCfg.botToken ? PASSWORD_PLACEHOLDER : ''}
                />
                <p className="text-[10px] text-muted-foreground">
                  Format chuẩn: <code>8 chữ số : 35+ ký tự</code>. Xoá hết = clear token. Để placeholder = giữ nguyên.
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm">
                  <Save className="h-3.5 w-3.5" />
                  Lưu Telegram
                </Button>
              </div>
            </form>

              {/* Helper: lấy chat_id sau khi save token */}
              {channels.telegram && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    Để gửi notification, bạn cần <strong>chat_id</strong> thật. Mở
                    Telegram → search bot → bấm Start, rồi click bên dưới:
                  </p>
                  <TelegramChatHelper />
                </div>
              )}
            </div>
          </details>
        </Card>

        {/* SMTP */}
        <Card>
          <details className="group">
            <summary className="cursor-pointer list-none p-6 hover:bg-accent/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90 text-muted-foreground" />
                  <Mail className="h-4 w-4" />
                  <span className="text-base font-semibold">Email (SMTP)</span>
                </div>
                {channels.email ? (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Đã cấu hình
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Chưa cấu hình
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 ml-6">
                Click để xem/sửa cấu hình. Mặc định đóng để bảo mật.
              </p>
            </summary>
            <div className="px-6 pb-6 space-y-3">
              <p className="text-xs text-muted-foreground">
                Gmail App Password / Sendgrid / AWS SES.
              </p>
              <form action={updateSmtpSettingsAction} className="space-y-3" autoComplete="off">
              <div className="grid gap-3 grid-cols-3">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="host" className="text-xs">
                    SMTP Host
                  </Label>
                  <Input
                    id="host"
                    name="host"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="smtp.gmail.com"
                    defaultValue={smtpCfg.host || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="port" className="text-xs">
                    Port
                  </Label>
                  <Input
                    id="port"
                    name="port"
                    type="number"
                    autoComplete="off"
                    defaultValue={smtpCfg.port || 587}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="user" className="text-xs">
                  Username
                </Label>
                <Input
                  id="user"
                  name="user"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="account@gmail.com"
                  defaultValue={smtpCfg.user || ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs">
                  Password / App Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={
                    smtpCfg.password
                      ? '••••••••••••••••• (đang có, để trống = giữ nguyên)'
                      : 'App password hoặc SMTP password'
                  }
                  defaultValue={smtpCfg.password ? PASSWORD_PLACEHOLDER : ''}
                />
                <p className="text-[10px] text-muted-foreground">
                  Gmail: bật 2FA → tạo App Password tại{' '}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    myaccount.google.com/apppasswords
                  </a>{' '}
                  (16 chữ thường, không có dấu cách).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="from" className="text-xs">
                  From (sender)
                </Label>
                <Input
                  id="from"
                  name="from"
                  autoComplete="off"
                  placeholder="Telecom Big CRM <noreply@telecombig.pe>"
                  defaultValue={smtpCfg.from || ''}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm">
                  <Save className="h-3.5 w-3.5" />
                  Lưu SMTP
                </Button>
              </div>
            </form>
            </div>
          </details>
        </Card>
      </div>
      {/* Add recipient form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thêm recipient mới</CardTitle>
          <CardDescription>
            Nhận daily digest và/hoặc realtime alert. Để branch trống = nhận tất cả chi nhánh.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addRecipientAction} className="grid gap-3 grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="channel" className="text-xs">Kênh *</Label>
              <Select id="channel" name="channel" required defaultValue="email">
                <option value="email">Email</option>
                <option value="telegram">Telegram</option>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="address" className="text-xs">Địa chỉ *</Label>
              <Input
                id="address"
                name="address"
                required
                placeholder="boss@telecombig.pe / -1001234567890 / @username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label" className="text-xs">Label</Label>
              <Input id="label" name="label" placeholder="vd: Giám đốc Lima" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch_id" className="text-xs">Chi nhánh</Label>
              <Select id="branch_id" name="branch_id">
                <option value="">— Tất cả —</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.code}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="digest_daily" defaultChecked />
                Daily digest
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="alert_reject" defaultChecked />
                Realtime alert
              </label>
              <Button type="submit" size="sm" className="mt-2">
                Thêm
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recipients list */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recipients ({recipients.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kênh</TableHead>
                <TableHead>Địa chỉ</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead className="text-center">Daily</TableHead>
                <TableHead className="text-center">Alert</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right w-[200px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Chưa có recipient nào.
                  </TableCell>
                </TableRow>
              )}
              {recipients.map((r) => (
                <RecipientRow
                  key={r.id}
                  recipient={r}
                  branches={branches}
                  channels={channels}
                  updateAction={updateRecipientAction}
                  toggleAction={toggleRecipientActiveAction}
                  deleteAction={deleteRecipientAction}
                  testSendAction={testSendAction}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lịch sử gửi (20 mới nhất)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Kênh</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Triggered by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Chưa có log nào — chưa gửi notification.
                  </TableCell>
                </TableRow>
              )}
              {recentLogs.map((l) => (
                <>
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{formatDateTime(l.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={l.channel === 'telegram' ? 'info' : 'secondary'}>
                        {l.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{l.recipient}</TableCell>
                    <TableCell className="text-sm">{l.subject || '—'}</TableCell>
                    <TableCell>
                      {l.status === 'sent' ? (
                        <Badge variant="success">Sent</Badge>
                      ) : l.status === 'failed' ? (
                        <Badge variant="destructive" title={l.errorMsg || ''}>
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="warning">{l.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.triggeredBy?.name || <em className="text-muted-foreground">cron</em>}
                    </TableCell>
                  </TableRow>
                  {l.status === 'failed' && l.errorMsg && (
                    <TableRow key={`err-${l.id}`}>
                      <TableCell colSpan={6} className="bg-destructive/5 border-l-4 border-destructive py-2">
                        <div className="text-xs">
                          <span className="font-medium text-destructive">⚠️ Error: </span>
                          <code className="font-mono text-foreground">{l.errorMsg}</code>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cron docs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cron — Daily digest tự động</CardTitle>
          <CardDescription>
            Gọi endpoint dưới đây vào 18:00 hằng ngày để gửi tổng kết.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <code className="block font-mono bg-muted p-3 rounded text-xs overflow-auto">
            curl &quot;http://localhost:3001/api/cron/daily-summary?key=$CRON_SECRET&quot;
          </code>
          <p className="text-xs text-muted-foreground">
            macOS launchd / Linux cron / GitHub Actions / Vercel Cron đều dùng được. Test trigger thủ công ở{' '}
            <Link href="/dashboard/reports" className="text-primary hover:underline">
              Reports page
            </Link>{' '}
            (button &ldquo;Gửi digest ngay&rdquo;).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
