---
title: Clone fresh — setup từ git clone
date: 2026-05-02
tags: [runbook, setup]
---

# Clone fresh — setup từ git clone

**Khi nào cần:** Clone repo về máy mới, hoặc clone vào folder khác và muốn chạy được.

## Pre-flight

- [ ] Node.js ≥ 20 (`node --version`)
- [ ] Đã có OpenAI API key (https://platform.openai.com/api-keys)
- [ ] Số WhatsApp riêng cho bot (không dùng số cá nhân chính)

## Steps

### 1. Install deps
```bash
npm install
# Lần đầu: tải Chromium ~150MB cho Puppeteer
```

### 2. Cấu hình env (CHÚ Ý: 2 file env riêng)

```bash
cp .env.example .env
cp crm/.env.example crm/.env.local
```

Sửa **`.env`** (root — bot + Prisma CLI):
- `OPENAI_API_KEY=sk-...`
- `ADMIN_API_KEY=<random hex>`
- `ALLOWED_GROUP_NAMES=Tên Group WhatsApp Chính Xác`
- `DATABASE_URL=file:/<absolute-path>/data/telecombig.db` ⚠️ **dùng absolute path**

Sửa **`crm/.env.local`** (Next.js):
- `DATABASE_URL="file:/<absolute-path>/data/telecombig.db"` ⚠️ **dùng absolute path, KHÔNG để folder cũ**
- `AUTH_SECRET=<openssl rand -base64 32>`

> **Lý do absolute path:** Prisma CLI chạy từ root, bot từ `bot/`, CRM từ `crm/` — relative path sẽ resolve khác nhau, gây bug khó debug.

### 3. Tạo DB + migrate
```bash
npx prisma migrate deploy --schema=./prisma/schema.prisma
```

### 4. Seed admin user
```bash
npm run crm:seed
# → admin@telecombig.pe / admin123
```

### 5. (Optional) Seed demo data
```bash
npm run bot:seed                      # branches, team leaders, campaigns
node crm/scripts/seed-demo-promotors.mjs
node crm/scripts/seed-demo-users.mjs  # branch_manager + viewer
```

### 6. Khởi động
```bash
# Terminal 1: bot (sẽ in QR code lần đầu)
npm run bot:start

# Terminal 2: CRM
npm run crm:dev
# → http://localhost:3001
```

## Verify

```bash
# Typecheck CRM (phải pass exit 0)
cd crm && npx tsc --noEmit

# Build CRM (phải pass, 0 warning)
cd crm && npm run build

# Bot syntax check
for f in bot/src/*.js bot/index.js; do node --check "$f"; done

# Prisma schema valid
npx prisma validate --schema=./prisma/schema.prisma
```

## Rollback (nếu hỏng DB)

```bash
# DB sandbox đã hỏng, restore từ production backup nếu có:
mv data/telecombig.db data/telecombig.db.broken
mv data/telecombig.db.production data/telecombig.db
```

Xem chi tiết: [[runbooks/restore-db-from-backup]]

## Common bugs khi clone

1. **`crm/.env.local` DATABASE_URL trỏ folder cũ** — fix bằng absolute path tới folder hiện tại.
2. **`prisma/data/telecombig.db` xuất hiện** — do chạy `prisma migrate dev` từ wrong cwd. Xoá hoặc archive.
3. **Port 3000/3001 đụng app khác** — `lsof -nP -iTCP:3000 -sTCP:LISTEN` để kiểm tra.
