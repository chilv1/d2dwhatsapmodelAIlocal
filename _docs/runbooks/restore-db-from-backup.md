---
title: Restore DB — switch giữa sandbox và production
date: 2026-05-02
tags: [runbook, db]
---

# Restore DB — switch giữa sandbox và production

**Khi nào cần:** Đang test trên DB sandbox, muốn switch về DB production để xem data thật. Hoặc DB hiện tại hỏng, restore từ backup.

## Pre-flight

- [ ] **Dừng bot và CRM dev server** trước (Prisma giữ file handle, rename khi đang chạy → corrupt)
- [ ] Confirm có file backup tồn tại (`ls data/*.db.*`)

## DB files convention (sau setup session 2026-05-02)

```
data/
├── telecombig.db                      ← DB ACTIVE (đang dùng)
├── telecombig.db.production           ← DB gốc clone từ project gốc, preserve
└── telecombig.db.<bất-kỳ>             ← Snapshot tự đặt tên
```

Tất cả `telecombig.db.*` đã gitignore (rule `data/*.db.*`).

## Steps — switch sang production DB

```bash
cd /Users/chilevan/Desktop/CRMREPORTD2DWHATSAPP

# 1. Snapshot DB sandbox hiện tại
mv data/telecombig.db data/telecombig.db.sandbox

# 2. Promote production thành active
mv data/telecombig.db.production data/telecombig.db
```

## Steps — switch ngược lại (sandbox)

```bash
cd /Users/chilevan/Desktop/CRMREPORTD2DWHATSAPP
mv data/telecombig.db data/telecombig.db.production
mv data/telecombig.db.sandbox data/telecombig.db
```

## Steps — restore từ backup arbitrary

```bash
# Backup DB hiện tại (đề phòng)
cp data/telecombig.db data/telecombig.db.before-restore-$(date +%Y%m%d)

# Restore
cp data/telecombig.db.<backup-name> data/telecombig.db
```

## Verify

```bash
# Check DB readable + count users
npx prisma studio --schema=./prisma/schema.prisma
# → mở GUI, check User table, Campaign table có data không
```

## Liên quan
- [[decisions/0001-monorepo-shared-prisma]]
