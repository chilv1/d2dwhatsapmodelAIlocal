/**
 * Helper endpoint: gọi Telegram getUpdates để liệt kê chat_id thật
 * mà user đã /start với bot hoặc add bot vào group.
 *
 * Auth: yêu cầu admin session.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTelegramConfig } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cfg = await getTelegramConfig();
  if (!cfg.botToken) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN chưa cấu hình' },
      { status: 400 },
    );
  }

  try {
    // 1. Verify token bằng getMe
    const meResp = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/getMe`,
    );
    const meData = await meResp.json();
    if (!meData.ok) {
      return NextResponse.json(
        { error: `Bot token invalid: ${meData.description || 'unknown'}` },
        { status: 400 },
      );
    }

    // 2. Lấy updates (max 100 mới nhất)
    const upResp = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/getUpdates?limit=100`,
    );
    const upData = await upResp.json();

    type ChatRow = {
      id: number;
      type: string;
      title?: string;
      username?: string;
      firstName?: string;
      lastUpdate: string;
    };
    const chatsMap = new Map<number, ChatRow>();

    for (const u of upData.result || []) {
      const msg = u.message || u.channel_post || u.edited_message;
      const chat = msg?.chat;
      if (!chat) continue;
      const date = msg.date ? new Date(msg.date * 1000).toISOString() : '';
      chatsMap.set(chat.id, {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        username: chat.username,
        firstName: chat.first_name,
        lastUpdate: date,
      });
    }

    return NextResponse.json({
      bot: {
        username: meData.result.username,
        firstName: meData.result.first_name,
        id: meData.result.id,
      },
      chats: Array.from(chatsMap.values()).sort((a, b) =>
        b.lastUpdate.localeCompare(a.lastUpdate),
      ),
      hint:
        chatsMap.size === 0
          ? `Chưa có chat nào. Mở Telegram → search @${meData.result.username} → bấm Start hoặc gõ /start. Add bot vào group rồi gõ tin trong group.`
          : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
