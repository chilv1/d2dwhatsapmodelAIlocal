/**
 * Email transport — nodemailer SMTP.
 * Config đọc từ DB settings (smtp.*), fallback env SMTP_*.
 * Cache transporter, reset khi config thay đổi.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { getSmtpConfig, registerEmailTransporterReset } from '@/lib/settings';

export type EmailSendResult = {
  ok: boolean;
  errorMsg?: string;
  messageId?: string;
};

let transporterCache: Transporter | null = null;
let cachedFingerprint = '';

// Đăng ký reset callback (settings.ts gọi khi user update SMTP)
registerEmailTransporterReset(() => {
  transporterCache = null;
  cachedFingerprint = '';
});

async function getTransporter(): Promise<{ tx: Transporter | null; from: string }> {
  const cfg = await getSmtpConfig();
  if (!cfg.host || !cfg.user || !cfg.password) {
    return { tx: null, from: cfg.from };
  }

  // Fingerprint để detect config thay đổi (defensive double-check)
  const fp = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (transporterCache && cachedFingerprint === fp) {
    return { tx: transporterCache, from: cfg.from };
  }

  transporterCache = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
  });
  cachedFingerprint = fp;
  return { tx: transporterCache, from: cfg.from };
}

export async function sendEmail(
  to: string,
  subject: string,
  textBody: string,
  htmlBody?: string,
): Promise<EmailSendResult> {
  const { tx, from } = await getTransporter();
  if (!tx) {
    return {
      ok: false,
      errorMsg: 'SMTP chưa cấu hình (cần SMTP_HOST + SMTP_USER + SMTP_PASSWORD)',
    };
  }

  try {
    const info = await tx.sendMail({
      from,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, errorMsg: (e as Error).message };
  }
}

export async function isEmailConfigured(): Promise<boolean> {
  const cfg = await getSmtpConfig();
  return !!(cfg.host && cfg.user && cfg.password);
}
