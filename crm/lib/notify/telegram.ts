/**
 * Telegram transport — gọi Bot API trực tiếp qua HTTP, không cần SDK.
 * Docs: https://core.telegram.org/bots/api#sendmessage
 *
 * Token đọc từ DB settings (telegram.bot_token), fallback env TELEGRAM_BOT_TOKEN.
 */
import { getTelegramConfig } from '@/lib/settings';

const TG_API_BASE = 'https://api.telegram.org';

export type TelegramSendResult = {
  ok: boolean;
  status?: number;
  errorMsg?: string;
  messageId?: number;
};

/**
 * Gửi message tới chat_id qua Bot API.
 * @param chatId  channel ID âm (-100xxx) HOẶC user/group ID (số) HOẶC @username
 * @param text    nội dung (Markdown supported nếu parseMode = 'Markdown')
 */
export async function sendTelegram(
  chatId: string,
  text: string,
  parseMode: 'Markdown' | 'HTML' | undefined = 'Markdown',
): Promise<TelegramSendResult> {
  const cfg = await getTelegramConfig();
  if (!cfg.botToken) {
    return { ok: false, errorMsg: 'TELEGRAM_BOT_TOKEN chưa cấu hình' };
  }

  try {
    const url = `${TG_API_BASE}/bot${cfg.botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
      error_code?: number;
    };

    if (!resp.ok || !data.ok) {
      return {
        ok: false,
        status: resp.status,
        errorMsg: data.description || `HTTP ${resp.status}`,
      };
    }

    return {
      ok: true,
      status: resp.status,
      messageId: data.result?.message_id,
    };
  } catch (e) {
    return { ok: false, errorMsg: (e as Error).message };
  }
}

export async function isTelegramConfigured(): Promise<boolean> {
  const cfg = await getTelegramConfig();
  return !!cfg.botToken;
}
