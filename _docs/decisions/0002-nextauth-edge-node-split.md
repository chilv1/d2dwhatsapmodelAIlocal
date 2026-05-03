---
title: ADR 0002 — Tách auth.config.ts (edge) khỏi auth.ts (node) cho NextAuth v5
date: 2026-05-02
status: accepted
tags: [decision, auth, security]
---

# ADR 0002: Tách auth.config.ts (edge) khỏi auth.ts (node)

## Context
NextAuth v5 cho phép chạy authorization check trong middleware (edge runtime). Edge runtime KHÔNG hỗ trợ Node-only deps (Prisma, bcrypt). Nếu để chung 1 file, build fail trên edge.

## Decision
Tách 2 file:

| File | Runtime | Chứa | Import được trong |
|---|---|---|---|
| `crm/auth.config.ts` | edge-safe | callbacks (jwt, session, authorized), no DB | middleware/proxy |
| `crm/auth.ts` | Node-only | full NextAuth setup, Credentials provider với bcrypt + Prisma | route handler, server component, server action |

Middleware import `auth.config.ts`, code Node import `auth.ts`. Cả 2 cùng dùng JWT session strategy nên session shape đồng nhất.

Trong **Next.js 16**, `middleware.ts` đã đổi tên thành `proxy.ts` (deprecation warning) — đã rename file + đổi `export const { auth: middleware }` → `auth: proxy`.

## Consequences
**Tích cực:**
- Edge middleware nhẹ (no Prisma bundle)
- Auth callback chạy gần user (edge CDN nếu deploy Vercel/Cloudflare)
- Session shape thống nhất qua JWT

**Tiêu cực / trade-off:**
- Đôi lúc cảm giác duplicate (cả 2 file gọi `NextAuth(...)`)
- Phải nhớ KHÔNG import `auth.ts` vào middleware/proxy

## References
- `crm/auth.config.ts` — edge config
- `crm/auth.ts` — node config (gồm Credentials + bcrypt + audit log)
- `crm/proxy.ts` — middleware/proxy
- NextAuth v5 docs: https://authjs.dev/getting-started/migrating-to-v5

## Liên quan
- [[runbooks/clone-fresh-setup]]
