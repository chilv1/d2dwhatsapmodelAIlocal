---
title: Runbook — Regenerate template description (Vision v2)
date: 2026-05-02
tags: [runbook, vision]
---

# Runbook: Regenerate template description

> Khi admin replace template image của 1 campaign, **`templateDescription` cũ vẫn còn** trong DB
> và sẽ được dùng cho compare → mismatch giữa image thật và text mô tả.

## Khi nào cần chạy

- Admin vừa upload template image MỚI cho 1 campaign đang active.
- Score đột nhiên drop / matches lệch sau khi đổi template.
- Setting `vision.template_as_text_enabled='1'` (default ON).

## Cách chạy (UI)

1. Login admin → `/dashboard/campaigns/<id>/edit`
2. Cuộn đến mục **"Mô tả template (Vision v2 — text thay cho image)"**
3. Click **🔁 Re-generate** (button đổi label sau lần đầu)
4. Đợi ~6s, AI gen description mới + suggested checklist
5. Review/edit description trong textarea
6. Click **Lưu thay đổi** ở cuối form

→ `templateDescriptionGeneratedAt` tự cập nhật khi description khác giá trị cũ.

## Cách chạy (CLI standalone, không cần UI)

```bash
node bot/src/scripts/test-template-description.js \
  data/templates/<filename>.png \
  "Tên campaign"
```

Output sẽ hiện description + suggested_requirements. Copy vào CRM edit page nếu muốn áp dụng.

## Cách chạy hàng loạt (script một lần)

Chưa có batch script. Nếu cần regenerate nhiều campaign cùng lúc:

```js
// scripts/batch-regenerate-descriptions.mjs (TODO)
const campaigns = await prisma.campaign.findMany({
  where: {
    templateImagePath: { not: null },
    OR: [
      { templateDescription: null },
      // Hoặc: templateImagePath updatedAt > templateDescriptionGeneratedAt
    ],
  },
});
for (const c of campaigns) {
  const result = await generateTemplateDescription({ ... });
  await prisma.campaign.update({ ... });
}
```

## Verify sau khi regenerate

1. `/dashboard/config-ai` → "Vision v2" card hiển thị coverage updated
2. Submit 1 ảnh test (qua bot hoặc benchmark script):
   ```bash
   node bot/src/scripts/benchmark-vision-modes.js 2
   ```
3. Verify `meets_standard` không thay đổi đột ngột.

## Rollback nếu kết quả tệ

- Nhanh nhất: tắt global flag → `/dashboard/config-ai` → uncheck "Template-as-text" → save.
  Bot dùng image mode trong 30s (settings cache TTL).
- Description không bị xoá — bật lại flag là dùng tiếp.

## Cost

1-time call gpt-4o ~$0.02 + 6s latency mỗi campaign. Khuyến nghị regenerate vào off-peak hour.
