---
title: Telecom Big — Knowledge Vault
created: 2026-05-02
---

# Telecom Big Knowledge Vault

Vault Obsidian cho project **Telecom Big Campaign Bot** (WhatsApp + AI vision + CRM dashboard cho khuyến mãi telecom Peru).

> 📌 **Cho Claude Code session sau:** đọc file này đầu mỗi session để có context. Cập nhật khi có decision/runbook mới.

## 🧭 Cấu trúc vault

```
_docs/
├── index.md           ← bạn đang ở đây
├── decisions/         ← ADR — vì sao chọn A thay vì B
├── runbooks/          ← How-to vận hành (DB restore, deploy, debug…)
├── context/           ← Project state hiện tại + roadmap
├── preferences/       ← User preferences cho Claude (mirror của ~/.claude memory)
└── templates/         ← Markdown template cho note mới
```

## 📋 Decisions (ADR)

- [[decisions/0001-monorepo-shared-prisma]] — bot/ + crm/ workspace, Prisma là single source of truth
- [[decisions/0002-nextauth-edge-node-split]] — auth.config (edge) vs auth.ts (node) split
- [[decisions/0003-vision-cache-sha256]] — Cache vision result, 1300× speedup
- [[decisions/0004-template-as-text-vision]] — Vision v2: text mô tả thay template image, -20% tokens, -35% latency

## 🛠 Runbooks

- [[runbooks/clone-fresh-setup]] — Setup từ git clone (fix env paths, migrate, seed)
- [[runbooks/restore-db-from-backup]] — Switch giữa DB sandbox và production
- [[runbooks/screenshot-crm]] — Test CRM bằng Puppeteer + screenshot
- [[runbooks/regenerate-template-description]] — Regenerate template text khi đổi ảnh template (Vision v2)

## 📍 Context

- [[context/current-state]] — Phase đã deploy, blocker hiện tại

## 👤 Preferences

- [[preferences/feedback_screenshots]] — Screenshot save path + auto-open

## 🆕 Tạo note mới

Dùng template:
- ADR mới: copy `templates/decision.md` → `decisions/NNNN-tên.md` (NNNN = số tăng dần)
- Runbook mới: copy `templates/runbook.md` → `runbooks/tên.md`

## 🔑 Convention

- File name: `kebab-case.md`
- Ngày: ISO `YYYY-MM-DD` trong frontmatter
- Wikilinks: `[[decisions/0001-…]]` (Obsidian tự autocomplete)
- Tag: `#decision`, `#runbook`, `#context`, `#preference`
