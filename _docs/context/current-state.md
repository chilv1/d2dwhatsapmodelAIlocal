---
title: Project state — snapshot 2026-05-02
date: 2026-05-02
tags: [context]
---

# Project state — snapshot 2026-05-02

> ⚠️ **Snapshot file** — sẽ outdated nhanh. Trước khi tin, verify bằng `git log --oneline | head` và đọc code thực tế.

## Phase đã deploy (production https://image.bitelbot.com)
- ✅ **Phase A — Speed**: Submissions list, 11 advanced filters, quick chips, Telegram `/approve` `/reject`, real-time polling 15s
- ✅ **Phase B — Accuracy**: Multi-image submission (30s window), image quality pre-check, comments/notes, audit timeline, AI confidence routing
- ✅ **Phase C — Convenience**: Mobile responsive, GPS heatmap, promotor leaderboard, SLA tracking, daily Telegram digest, custom rejection reasons
- ✅ **Phase D — Monitoring**: Branch GPS HQ + radius, auto-escalation cron 30min, duplicate image alert, weekly training cron, cache rate alert

## Bản clone hiện tại (`/Users/chilevan/Desktop/CRMREPORTD2DWHATSAPP/`)

- Cloned từ project gốc `CTYAI` (folder cũ)
- 2 remote: `origin` (chilv1/reportcampaignwhatsapp) + `d2d` (chilv1/d2dwhatsapmodelAIlocal)
- Branch chính: `main`
- DB hiện tại: **sandbox** (1 user admin, không campaign/submission). DB production preserved ở `data/telecombig.db.production`.

## Recent fixes (commit 758dc70 — 2026-05-02)
- 21 lỗi TypeScript CRM (NextAuth v5 overload broken) → fix bằng `import 'next-auth/jwt'` + import `Session` từ `next-auth`
- `middleware.ts` → `proxy.ts` (Next.js 16 deprecation)
- `devIndicators` chuyển sang bottom-right (đã đụng "Đăng xuất" trong sidebar)
- NFT trace warning trong `app/api/files/[...path]/route.ts` → `/*turbopackIgnore*/`
- 3 seed script: respect env, fallback PROJECT_ROOT
- `.gitignore`: thêm `data/*.db.*` + `prisma/data/`

## Bug đã biết / TODO

- **Vision cache không invalidate khi đổi model** — nếu admin switch gpt-4o ↔ gpt-4o-mini, cache cũ vẫn dùng. Xem [[decisions/0003-vision-cache-sha256]].
- **VisionCache table không có TTL/cleanup** — sẽ phình theo thời gian.
- **`OPENAI_API_KEY` plain text trong `.env`** — `.gitignore` đã chặn (verified `git log` không trả gì), nhưng cần process khác (vd 1Password CLI) cho production.
- **Vision v2 — `templateDescriptionGeneratedAt` vs `templateImagePath` updatedAt drift** — admin replace template image nhưng quên regenerate description → text mô tả lệch ảnh. UI chưa có warning. Runbook: [[runbooks/regenerate-template-description]].

## Vision v2 — Template-as-text (deployed 2026-05-02)

- ADR: [[decisions/0004-template-as-text-vision]]
- Token saving production: ~20% input + ~35% latency (benchmark)
- Setting toggle: `vision.template_as_text_enabled` (default ON), per-campaign auto-fallback khi chưa có description
- Dashboard stats: `/dashboard/config-ai` → "Vision v2" card

## Roadmap (từ README)
- [ ] Auto restart Puppeteer khi WhatsApp disconnect
- [ ] Migrate Postgres khi scale lớn (xem [[decisions/0001-monorepo-shared-prisma]])
- [ ] Hỗ trợ GPS qua Location message kèm theo
