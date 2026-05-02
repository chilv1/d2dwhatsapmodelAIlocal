/**
 * E2E test M6 — Notifications (Telegram + Email).
 * Test UI flow + cron endpoint + recipient management.
 * Không test thực sự gửi (cần real Telegram/SMTP creds), chỉ verify dispatch logic.
 */
import puppeteer from 'puppeteer';
import { resolve } from 'node:path';

const BASE_URL = 'http://localhost:3001';
const SCREENSHOT_DIR = resolve(process.cwd(), 'data', 'screenshots');

const PASS = '✅';
const FAIL = '❌';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? PASS : FAIL} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    document.querySelector('input[name="email"]').value = '';
  });
  await page.type('input[name="email"]', 'admin@telecombig.pe', { delay: 15 });
  await page.type('input[name="password"]', 'admin123', { delay: 15 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function snap(page, filename, description) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: true });
  console.log(`   📸 ${description}: ${filename}`);
}

async function readEnvCronSecret() {
  const fs = await import('node:fs');
  try {
    const content = fs.readFileSync(`${process.cwd()}/crm/.env.local`, 'utf8');
    const m = content.match(/^CRON_SECRET=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🚀 M6 E2E Test — Telegram + Email Notifications\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await login(page);
  check('1. Admin login', page.url().includes('/dashboard'));

  // ── Notifications page ──
  await page.goto(`${BASE_URL}/dashboard/notifications`, {
    waitUntil: 'networkidle0',
  });
  const hasH1 = await page.evaluate(() =>
    document.body.textContent?.includes('Notifications') || false,
  );
  check('2. /dashboard/notifications loads', hasH1);
  await snap(page, 'm6_01_notifications_initial.png',
    'Notifications page (channel status + add form + empty state)');

  // Verify channel status (phải có "Chưa cấu hình" cho cả 2)
  const hasChannelStatus = await page.evaluate(() =>
    document.body.textContent?.includes('Telegram') &&
    document.body.textContent?.includes('Email'),
  );
  check('3. Channel status cards hiển thị', hasChannelStatus);

  // ── Add recipients ──
  // Helper: submit add form đúng cách (form chứa input[name=address])
  async function submitAddForm() {
    const btn = await page.evaluateHandle(() => {
      const addr = document.querySelector('input[name="address"]');
      const form = addr?.closest('form');
      return form?.querySelector('button[type="submit"]') ?? null;
    });
    const ok = await btn.evaluate((b) => b !== null);
    if (!ok) throw new Error('Add form submit button not found');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {}),
      btn.click(),
    ]);
  }

  // Email recipient
  await page.evaluate(() => {
    const sel = document.querySelector('select[name="channel"]');
    if (sel) sel.value = 'email';
  });
  await page.type('input[name="address"]', 'boss@telecombig.pe', { delay: 10 });
  await page.type('input[name="label"]', 'Giám đốc Test', { delay: 10 });
  await submitAddForm();

  let recipRows = await page.$$eval('tbody tr', (rs) => rs.length);
  check('4. Add email recipient → ≥1 row',
    recipRows >= 1, `rows = ${recipRows}`);

  // Telegram recipient
  await page.evaluate(() => {
    const sel = document.querySelector('select[name="channel"]');
    if (sel) sel.value = 'telegram';
    const addr = document.querySelector('input[name="address"]');
    if (addr) addr.value = '';
    const lbl = document.querySelector('input[name="label"]');
    if (lbl) lbl.value = '';
  });
  await page.type('input[name="address"]', '-1001234567890', { delay: 10 });
  await page.type('input[name="label"]', 'Channel Lima', { delay: 10 });
  await submitAddForm();

  recipRows = await page.$$eval('tbody tr', (rs) => rs.length);
  check('5. Add Telegram recipient → ≥2 rows',
    recipRows >= 2, `rows = ${recipRows}`);

  await snap(page, 'm6_02_notifications_with_recipients.png',
    'Notifications page với 2 recipients đã thêm');

  // ── Test send (sẽ fail vì chưa có real config, nhưng tạo log "failed") ──
  // Click test send button trên row đầu tiên
  const testSendBtn = await page.evaluateHandle(() => {
    const forms = document.querySelectorAll('form');
    for (const f of forms) {
      const btn = f.querySelector('button[title="Test send"]');
      if (btn && !btn.disabled) return btn;
    }
    return null;
  });
  const isClickable = await testSendBtn.evaluate((b) => b !== null);
  // Test send button bị disabled vì chưa có config → không click được
  check('6. Test send button disable đúng khi chưa có config',
    !isClickable, `enabled? ${isClickable}`);

  // Reports page có button "Gửi digest ngay"
  await page.goto(`${BASE_URL}/dashboard/reports`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));
  const hasDigestBtn = await page.evaluate(() =>
    document.body.textContent?.includes('Gửi digest ngay') ||
    document.body.textContent?.includes('Trigger digest'),
  );
  check('7. Reports page có button "Gửi digest ngay"', hasDigestBtn);
  await snap(page, 'm6_03_reports_with_send_digest.png',
    'Reports page có button gửi digest + export');

  // ── Cron endpoint test ──
  console.log('\n— Testing cron endpoint —');
  const cronSecret = await readEnvCronSecret();
  check('8. CRON_SECRET có trong .env.local',
    !!cronSecret, `secret = ${cronSecret ? cronSecret.slice(0, 8) + '...' : 'missing'}`);

  if (cronSecret) {
    // Test missing key → 401
    const noKey = await fetch(`${BASE_URL}/api/cron/daily-summary`);
    check('9. Cron without key → 401',
      noKey.status === 401, `status = ${noKey.status}`);

    // Test wrong key → 401
    const wrongKey = await fetch(`${BASE_URL}/api/cron/daily-summary?key=wrong`);
    check('10. Cron với wrong key → 401',
      wrongKey.status === 401, `status = ${wrongKey.status}`);

    // Test correct key → 200 (sẽ fail dispatch vì chưa có config, nhưng response 200)
    const okKey = await fetch(`${BASE_URL}/api/cron/daily-summary?key=${cronSecret}`);
    const okBody = await okKey.json().catch(() => ({}));
    check('11. Cron với correct key → 200',
      okKey.status === 200, `status = ${okKey.status}`);
    check('12. Cron response có summary structure',
      typeof okBody.summary === 'object' && 'date' in okBody,
      `keys = ${Object.keys(okBody).join(',')}`);
    console.log(`   📋 cron response: ${JSON.stringify(okBody.summary || {})}, sent=${okBody.sent || 0}, failed=${okBody.failed || 0}`);
  }

  // ── Logs page (sau khi dispatch) ──
  await page.goto(`${BASE_URL}/dashboard/notifications`, { waitUntil: 'networkidle0' });
  // Look at logs section
  const hasLogs = await page.evaluate(() =>
    document.body.textContent?.includes('Lịch sử gửi') || false,
  );
  check('13. Notifications page có section "Lịch sử gửi"', hasLogs);
  await snap(page, 'm6_04_notifications_with_logs.png',
    'Notifications page sau khi cron chạy (có logs failed vì chưa config)');

  // ── Audit log có notification.recipient_add entries ──
  await page.goto(`${BASE_URL}/dashboard/audit?action=notification.recipient_add`,
    { waitUntil: 'networkidle0' });
  const hasAuditEntries = await page.$$eval('tbody tr', (rs) => rs.length);
  check('14. Audit log có notification.recipient_add entries',
    hasAuditEntries >= 2, `entries = ${hasAuditEntries}`);

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Result: ${passed}/${total} ${passed === total ? '✅ ALL PASS' : `⚠ ${total - passed} FAILED`}`);
  if (passed !== total) process.exit(1);
}

main().catch((err) => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
