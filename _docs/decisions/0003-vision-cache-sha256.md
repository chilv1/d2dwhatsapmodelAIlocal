---
title: ADR 0003 — Vision result cache theo SHA-256 image hash
date: 2026-05-02
status: accepted
tags: [decision, performance, cost]
---

# ADR 0003: Cache vision result theo SHA-256

## Context
Mỗi lần bot gọi OpenAI gpt-4o vision tốn ~$0.009 và ~4 giây. Promotor đôi khi gửi LẠI ảnh cũ (vd thi nhau gửi cùng 1 ảnh template để gian lận, hoặc reuse ảnh ngày trước). Tốn cost + chậm.

## Decision
- Compute SHA-256 của image buffer trước khi gọi vision
- Key cache: `(imageHash, campaignId, detectionMode)` — unique constraint
- Lookup trong table `VisionCache` trước khi gọi API
- Cache HIT: trả về JSON evaluation lưu sẵn, mark `submission.visionCached = true`
- Cache MISS: gọi API, lưu kết quả vào cache với `compareImagePath` (reuse compose result)

Toggle qua setting `vision.cache_enabled` (default off — admin enable trong `/dashboard/config-ai` UI).

Detection mode (Hướng 1 vs Hướng 2) cache RIÊNG vì prompt khác nhau.

## Consequences
**Tích cực:**
- Cache HIT 3ms vs API 4000ms → ~1300× faster
- Cost saving khi promotor reuse ảnh cũ (~10-30% theo metric thực tế)
- Phát hiện duplicate ảnh: cache hit > 24h → cảnh báo "♻️ Promotor reuse ảnh cũ" (Phase D)

**Tiêu cực / trade-off:**
- DB cache table phình — cần TTL/cleanup cron sau (chưa làm)
- SHA-256 collision risk thấp nhưng tồn tại — chấp nhận
- Nếu thay model (gpt-4o → gpt-4o-mini), cache cũ vẫn dùng — có thể sai. *Cần invalidate cache khi đổi model.* (TODO)

## Alternatives considered
- **Perceptual hash (pHash)**: bị loại vì AI eval quan tâm chi tiết, không nên fuzzy match
- **No cache**: bị loại vì cost + latency

## References
- `bot/src/cache.js` — cache implementation
- `prisma/schema.prisma:303-317` — VisionCache model
- `bot/src/vision.js` — call site
