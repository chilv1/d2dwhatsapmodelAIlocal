---
title: ADR 0004 — Template-as-text trong vision compare (Vision v2)
date: 2026-05-02
status: accepted
tags: [decision, performance, cost, vision]
---

# ADR 0004: Template-as-text — bỏ template image trong runtime compare

## Context

Hệ vision hiện tại (ADR 0003 + earlier) gửi **2 ảnh `detail:'high'`** (template + user) mỗi
submission cho gpt-4o. Mỗi call ~5400 input tokens, ~$0.02. Template image lặp lại y hệt
mỗi call dù không bao giờ đổi → lãng phí.

Trước khi build v2 đã cân nhắc 3 hướng:

1. **OpenAI prompt caching** chỉ — cần message order chuẩn, tự cache 5 phút. Lợi ~50%
   với calls liên tiếp cùng campaign nhưng không giúp gì khi rush hour rải rác.
2. **Template-as-text** — pre-compute description text từ template, runtime bỏ template image.
3. **Embedding pre-filter (CLIP)** — infra mới, độ phức tạp cao.

## Decision

Triển khai **template-as-text mode** kết hợp prompt-cache-friendly message structure:

- Khi admin upload template: 1-time call gpt-4o sinh `templateDescription` (text 200-500 chữ)
  + `suggested_requirements` (checklist gợi ý). Admin review/edit + lưu vào
  `Campaign.templateDescription`.
- Runtime compare:
  - Nếu `templateDescription` tồn tại + setting `vision.template_as_text_enabled='1'`
    → bỏ template image, gửi text mô tả.
  - Ngược lại fallback image mode (current behavior).
- Message structure mới: cacheable prefix (system + per-campaign content) đầu, user image cuối
  → tận dụng OpenAI prompt caching.
- Cache key (`VisionCache`) thêm `templateMode` để 2 modes không trộn cache.

Toggle global `vision.template_as_text_enabled` (default ON), per-campaign auto-fallback
khi chưa có description.

## Benchmark thực tế (4 ảnh × 2 modes, 2026-05-02)

| Metric | Image mode | Text mode |
|---|---|---|
| meets_standard agreement | — | **100%** (4/4) |
| Mean score divergence | — | 7.5 (max 30, AI variance) |
| Avg input tokens/call | ~4,300 | ~3,450 (-19.6%) |
| Avg latency | ~4.3s | ~2.8s (-35%) |

`max divergence 30` xảy ra trên 1 ảnh: image-mode trả score 40 VƯỢT formula range (R=4, F=2
→ formula nói 10-30), text-mode trả 10 ĐÚNG formula. → text mode tuân thủ system prompt
chặt hơn.

## Consequences

**Tích cực:**

- ~20% saving input tokens production (cao hơn nếu prompt caching kick in cho campaigns
  rush hour cùng 5 phút).
- ~35% giảm latency vision call (1 image thay vì 2).
- Admin UX: auto-generate checklist gợi ý từ template → giảm công soạn `requirementsJson`.
- Fallback an toàn: campaign chưa có description tự dùng image mode.

**Tiêu cực / trade-off:**

- Phụ thuộc chất lượng `templateDescription`. Mitigation: admin review/edit textarea
  trước khi save; warning khi `templateImagePath` updated nhưng description chưa regenerate
  (TODO).
- Visual subtle (vd phân biệt 2 logo gần giống) có thể yếu hơn image mode. Hiện global
  toggle, sau có thể per-campaign override.
- Score variance ±30 giữa 2 modes là AI behavior bình thường (`temperature=0` không
  guarantee bit-perfect output). `meets_standard` (production decision metric) vẫn 100%
  agree trên test.

## Alternatives considered

- **Embedding pre-filter (CLIP)**: bị defer — infra mới, ROI chưa rõ trước khi prove
  template-as-text hoạt động.
- **Tier model (gpt-4o-mini → 4o escalation)**: bị loại — confidence của mini không đủ
  reliable cho QA decision.
- **Split GPS extraction sang gpt-4o-mini**: bị defer — phức tạp hoá flow, saving
  marginal so với template-as-text.

## References

- `bot/src/vision.js` — `generateTemplateDescription` + refactored `evaluateSubmissionImage`
- `crm/lib/vision-template-desc.ts` — TS twin cho CRM API route
- `crm/components/template-description-generator.tsx` — admin UI button + textarea
- `bot/src/scripts/benchmark-vision-modes.js` — benchmark image vs text
- `prisma/migrations/20260502180000_add_template_description` — Campaign fields
- `prisma/migrations/20260502190000_add_template_mode_to_vision_cache` — cache key
- Setting: `vision.template_as_text_enabled` (default '1')
- Dashboard: `/dashboard/config-ai` Vision v2 stats card
