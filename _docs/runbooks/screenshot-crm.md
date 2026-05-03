---
title: Screenshot CRM bằng Puppeteer
date: 2026-05-02
tags: [runbook, test]
---

# Screenshot CRM bằng Puppeteer

**Khi nào cần:** Verify UI sau khi sửa, debug layout, capture state cho report.

## Pre-flight

- [ ] CRM dev server đang chạy (`npm run crm:dev` → port 3001)
- [ ] Đã có admin user trong DB (`npm run crm:seed` nếu chưa)
- [ ] Folder `~/Desktop/screenshots/` tồn tại (script tự `mkdir -p`)

## Script (đặt trong project root để Puppeteer nhìn thấy)

```js
// _screenshot.mjs (xoá sau khi xong)
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const OUT_DIR = resolve(homedir(), 'Desktop', 'screenshots');
await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();

// Login (form pre-fill default cred → MUST clear trước khi type)
await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle0' });
const email = await page.$('input[type="email"]');
const pw = await page.$('input[type="password"]');
await email.click({ clickCount: 3 });
await page.keyboard.press('Backspace');
await email.type('admin@telecombig.pe');
await pw.click({ clickCount: 3 });
await page.keyboard.press('Backspace');
await pw.type('admin123');

await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0' }),
  page.click('button[type="submit"]'),
]);

await page.screenshot({ path: `${OUT_DIR}/dashboard.png`, fullPage: true });
await browser.close();
```

## Run

```bash
cd /Users/chilevan/Desktop/CRMREPORTD2DWHATSAPP
node _screenshot.mjs
open ~/Desktop/screenshots/dashboard.png   # Preview tự bật
rm _screenshot.mjs                          # cleanup
```

## Common bugs

1. **`Cannot find package 'puppeteer'`** — script không đặt trong project. Phải chạy từ folder có `node_modules/puppeteer`.
2. **Login không redirect** — form pre-fill default cred, `page.type` append vào → email invalid. **Phải clear trước khi type** (xem snippet trên).
3. **Screenshot trắng/blank** — chưa `await waitUntil: 'networkidle0'` đủ. Tăng timeout hoặc dùng `page.waitForSelector`.

## Liên quan
- [[preferences/feedback_screenshots]] — quy ước save path
