---
title: ADR 0001 — Monorepo bot/ + crm/ với Prisma schema chia sẻ
date: 2026-05-02
status: accepted
tags: [decision, architecture]
---

# ADR 0001: Monorepo bot/ + crm/ với Prisma schema chia sẻ

## Context
Project có 2 service tách biệt rõ ràng:
- **bot/** — Node.js worker chạy WhatsApp (Puppeteer) + OpenAI vision
- **crm/** — Next.js dashboard cho admin

Cả 2 cùng đọc/ghi 1 SQLite. Cần chia sẻ schema mà không duplicate.

## Decision
- **npm workspaces** ở root `package.json` với `"workspaces": ["bot", "crm"]`
- **Prisma schema duy nhất** ở `prisma/schema.prisma` — generate Prisma client vào `node_modules/.prisma/client` (hoisted), cả 2 workspace import cùng client
- Dùng SQLite (`file:./data/telecombig.db`) — đơn giản, đủ cho scale hiện tại (~250 ảnh/ngày)

## Consequences
**Tích cực:**
- Schema sửa 1 chỗ, cả 2 service apply
- Không cần API trung gian giữa bot và CRM (cùng đọc DB)
- Deploy đơn giản: 2 systemd unit, cùng cwd

**Tiêu cực / trade-off:**
- SQLite không scale ngang — nếu lưu lượng tăng phải migrate Postgres (đã ghi trong README roadmap)
- Cả 2 service phải chạy cùng máy (file DB local)
- Không thể deploy CRM lên Vercel/serverless (cần file system bền vững)

## Alternatives considered
- **Postgres ngay từ đầu**: bị loại vì overhead vận hành cao cho scale 25 chi nhánh
- **Bot expose REST cho CRM**: bị loại vì thêm 1 layer không cần (cùng cwd, cùng owner)

## References
- `prisma/schema.prisma` — single source of truth
- `package.json:6-9` — workspaces config
- `bot/src/db.js:11` — bot Prisma init
- `crm/lib/prisma.ts` — CRM Prisma init
