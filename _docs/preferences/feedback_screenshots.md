---
name: Screenshot save path + auto-open
description: Khi chụp screenshot (Puppeteer hay bất kỳ tool nào), save vào ~/Desktop/screenshots/ và tự mở Preview sau khi xong
type: feedback
date: 2026-05-02
tags: [preference, screenshot]
---

# Screenshot save path + auto-open

Khi tạo screenshot trong các session test/automation:

1. Save vào `~/Desktop/screenshots/` (tự `mkdir -p` nếu chưa có), KHÔNG dùng `/tmp` (bị macOS dọn khi reboot).
2. Sau khi chụp xong, tự chạy `open <path-to-screenshot>` hoặc `open <folder>` để Preview bật lên — không cần user yêu cầu thêm.

**Why:** User đã gặp tình huống screenshot ở `/tmp` rồi phải hỏi cách xem. Path bền vững + auto-open giúp workflow liền mạch.

**How to apply:** Trong mọi script Puppeteer/Playwright/screencapture, đặt OUT_DIR thành `${process.env.HOME}/Desktop/screenshots` (hoặc tương đương trong shell). Sau khi script kết thúc, gọi `open` với folder hoặc multi-file glob.

## Liên quan
- [[../runbooks/screenshot-crm]]
