# CLAUDE.md

> Entry point cho Claude Code session. Đọc file này đầu mỗi session mới.

## 📚 Knowledge vault tại `_docs/`

Toàn bộ context, decisions, runbooks, preferences nằm trong **Obsidian vault**:

- 🧭 **Bắt đầu từ:** [`_docs/index.md`](_docs/index.md) — landing page với wikilinks
- 📋 Decisions (ADR): [`_docs/decisions/`](_docs/decisions/)
- 🛠 Runbooks: [`_docs/runbooks/`](_docs/runbooks/)
- 📍 Project state hiện tại: [`_docs/context/current-state.md`](_docs/context/current-state.md)
- 👤 User preferences: [`_docs/preferences/`](_docs/preferences/)

## 🧠 Memory rule

User preferences và feedback lưu ở `_docs/preferences/` (commit vào git, portable theo repo).

**Khi cần ghi memory mới:**
1. Write file vào `_docs/preferences/<name>.md` (frontmatter có `type: feedback|user|project|reference`)
2. Thêm pointer vào `~/.claude/projects/-Users-chilevan-Desktop-CRMREPORTD2DWHATSAPP/memory/MEMORY.md` (auto-loaded vào context):
   ```
   - [Title](/Users/chilevan/Desktop/CRMREPORTD2DWHATSAPP/_docs/preferences/<name>.md) — one-line hook
   ```
3. **Đừng tạo file memory ở `~/.claude/.../memory/` nữa** — chỉ để MEMORY.md ở đó làm pointer index.

## 🚀 Quick commands

```bash
# Verify codebase health
cd crm && npx tsc --noEmit && npm run build      # CRM typecheck + build
for f in bot/src/*.js bot/index.js; do node --check "$f"; done   # Bot syntax
npx prisma validate --schema=./prisma/schema.prisma              # Schema valid

# Dev
npm run bot:start                                  # Bot + WhatsApp
npm run crm:dev                                    # CRM port 3001

# Test/seed
npm run crm:seed                                   # Admin: admin@telecombig.pe / admin123
```

## 📐 Project structure (chi tiết: README.md)

```
CRMREPORTD2DWHATSAPP/
├── bot/              Node.js worker — WhatsApp + OpenAI vision
├── crm/              Next.js 16 dashboard
├── prisma/           SOURCE OF TRUTH (schema + 11 migrations)
├── data/             SQLite DB + uploads + WA session
├── _docs/            Obsidian vault (this!)
└── _archive_python/  Phiên bản cũ
```

## ⚠️ Setup mới sau clone

Đọc [`_docs/runbooks/clone-fresh-setup.md`](_docs/runbooks/clone-fresh-setup.md) — có checklist + common bugs.
