/**
 * E2E test M5 — Promotors + Reports + Excel export.
 */
import puppeteer from 'puppeteer';
import { resolve } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';

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

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    document.querySelector('input[name="email"]').value = '';
  });
  await page.type('input[name="email"]', email, { delay: 15 });
  await page.type('input[name="password"]', password, { delay: 15 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function snap(page, filename, description) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: true });
  console.log(`   📸 ${description}: ${filename}`);
}

async function main() {
  console.log('🚀 M5 E2E Test — Promotors + Reports + Excel\n');

  const downloadPath = resolve(process.cwd(), 'data', 'screenshots', 'downloads');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Setup download behavior
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath,
  });

  // Login as admin
  await login(page, 'admin@telecombig.pe', 'admin123');
  check('1. Admin login', page.url().includes('/dashboard'));

  // ── Promotors ──
  await page.goto(`${BASE_URL}/dashboard/promotors`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table', { timeout: 5000 });
  const promRows = await page.$$eval('tbody tr', (rs) => rs.length);
  check('2. Promotors list (3 promotors)', promRows >= 3, `rows = ${promRows}`);
  await snap(page, 'm5_01_promotors_list.png', 'Promotors list với KPI rate');

  // Promotor detail
  const firstPromLink = await page.$('tbody tr td:last-child a');
  if (firstPromLink) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      firstPromLink.click(),
    ]);
    check('3. Promotor detail loads',
      /\/dashboard\/promotors\/\d+/.test(page.url()),
      `URL = ${page.url()}`);
    const statsText = await page.evaluate(() => document.body?.textContent || '');
    const hasStats =
      statsText.includes('Tổng submissions') &&
      statsText.includes('Đã đạt') &&
      statsText.includes('Tỉ lệ đạt');
    check('4. Promotor detail có 3 stat cards', hasStats);
    await snap(page, 'm5_02_promotor_detail.png',
      'Promotor detail với KPI + recent submissions');
  }

  // Promotor create form
  await page.goto(`${BASE_URL}/dashboard/promotors/new`, { waitUntil: 'networkidle0' });
  const hasForm = (await page.$('input[name="employee_code"]')) !== null;
  check('5. Promotor create form', hasForm);
  await snap(page, 'm5_03_promotor_create.png', 'Promotor create form');

  // Submission detail có promotor assignment card
  await page.goto(`${BASE_URL}/dashboard/submissions/1`, { waitUntil: 'networkidle0' });
  const hasPromAssign = await page.evaluate(() =>
    document.body.textContent?.includes('Promotor đảm nhận') || false,
  );
  check('6. Submission detail có promotor assignment card', hasPromAssign);
  await snap(page, 'm5_04_submission_with_promotor.png',
    'Submission detail có promotor card + override card');

  // Reports page (default 30 days)
  await page.goto(`${BASE_URL}/dashboard/reports`, { waitUntil: 'networkidle0' });
  // Wait charts render
  await new Promise((r) => setTimeout(r, 2000));
  const hasRecharts = await page.$$eval('.recharts-responsive-container',
    (els) => els.length);
  check('7. Reports page render charts', hasRecharts >= 2,
    `recharts containers = ${hasRecharts}`);
  await snap(page, 'm5_05_reports_30days.png',
    'Reports — 30 ngày charts + KPI ranking + export buttons');

  // Reports 7 days
  await page.goto(`${BASE_URL}/dashboard/reports?days=7`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));
  await snap(page, 'm5_06_reports_7days.png', 'Reports — 7 ngày view');
  check('8. Reports 7-day URL works',
    page.url().includes('days=7'), `URL = ${page.url()}`);

  // ── Excel export test (verify file actually downloads) ──
  console.log('\n— Testing Excel exports —');

  // Test daily-reports export
  // Use fetch with cookies từ Puppeteer
  const cookies = await page.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const dailyResp = await fetch(`${BASE_URL}/api/export/daily-reports?days=30`, {
    headers: { Cookie: cookieHeader },
  });
  const dailyOk = dailyResp.ok;
  const dailyType = dailyResp.headers.get('content-type') || '';
  check('9. /api/export/daily-reports returns 200',
    dailyOk, `status = ${dailyResp.status}`);
  check('10. daily-reports content-type is xlsx',
    dailyType.includes('spreadsheetml'),
    `type = ${dailyType.slice(0, 50)}`);

  if (dailyOk) {
    const buf = await dailyResp.arrayBuffer();
    check('11. daily-reports file size > 4KB',
      buf.byteLength > 4000, `size = ${buf.byteLength} bytes`);
  }

  // Test submissions export
  const subsResp = await fetch(`${BASE_URL}/api/export/submissions?days=30`, {
    headers: { Cookie: cookieHeader },
  });
  check('12. /api/export/submissions returns 200',
    subsResp.ok, `status = ${subsResp.status}`);
  if (subsResp.ok) {
    const buf = await subsResp.arrayBuffer();
    check('13. submissions file size > 4KB',
      buf.byteLength > 4000, `size = ${buf.byteLength} bytes`);
  }

  // Test unauth → 307 redirect (middleware blocks) hoặc 401 (route check)
  // fetch tự follow redirect nên dùng redirect: 'manual' để detect chính xác
  const noAuthResp = await fetch(`${BASE_URL}/api/export/daily-reports`, {
    redirect: 'manual',
  });
  const blocked = noAuthResp.status === 307 || noAuthResp.status === 401;
  check('14. Export without auth bị block (307/401)',
    blocked, `status = ${noAuthResp.status}`);

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
