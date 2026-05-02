/**
 * E2E test M3 — Submissions + Campaigns module.
 * Login → navigate qua các page chính → screenshot mỗi page.
 *
 * Chạy: node crm/scripts/e2e-test-m3.mjs
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
  await page.type('input[name="email"]', 'admin@telecombig.pe', { delay: 20 });
  await page.type('input[name="password"]', 'admin123', { delay: 20 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function snap(page, filename, description) {
  const path = `${SCREENSHOT_DIR}/${filename}`;
  await page.screenshot({ path, fullPage: true });
  console.log(`   📸 ${description}: ${filename}`);
}

async function main() {
  console.log('🚀 M3 E2E Test — Submissions + Campaigns\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Login
  await login(page);
  check('1. Login OK', page.url().includes('/dashboard'), `URL = ${page.url()}`);

  // Test 2: Dashboard home
  await page.waitForSelector('h1', { timeout: 5000 });
  const dashH1 = await page.$eval('h1', (el) => el.textContent);
  check('2. Dashboard home renders', dashH1?.includes('Welcome'),
    `h1 = "${dashH1}"`);
  await snap(page, 'm3_01_dashboard_home.png', 'Dashboard home với recent activity');

  // Test 3: Submissions list
  await page.goto(`${BASE_URL}/dashboard/submissions`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table', { timeout: 5000 });
  const subRowCount = await page.$$eval('tbody tr', (rows) => rows.length);
  check('3. Submissions list loads', subRowCount >= 1,
    `tbody rows = ${subRowCount}`);
  await snap(page, 'm3_02_submissions_list.png', 'Submissions list với filter');

  // Test 4: Click vào 1 submission để xem detail
  const firstViewLink = await page.$('tbody tr td:last-child a');
  if (firstViewLink) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      firstViewLink.click(),
    ]);
    const onDetail = page.url().includes('/dashboard/submissions/');
    check('4. Submission detail navigation', onDetail,
      `URL = ${page.url()}`);

    await page.waitForSelector('img', { timeout: 5000 }).catch(() => {});
    const imgCount = await page.$$eval('img', (imgs) => imgs.length);
    check('5. Detail page có ảnh side-by-side', imgCount >= 2,
      `<img> count = ${imgCount}`);

    await snap(page, 'm3_03_submission_detail.png',
      'Submission detail (side-by-side template + actual)');
  } else {
    check('4. Submission detail navigation', false, 'No view link found');
  }

  // Test 6: Filter submissions
  await page.goto(
    `${BASE_URL}/dashboard/submissions?result=approved`,
    { waitUntil: 'networkidle0' },
  );
  const filteredCount = await page.$$eval('tbody tr', (rows) => rows.length);
  check('6. Filter ?result=approved hoạt động', filteredCount >= 1,
    `filtered rows = ${filteredCount}`);

  // Test 7: Campaigns list
  await page.goto(`${BASE_URL}/dashboard/campaigns`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table', { timeout: 5000 });
  const campRowCount = await page.$$eval('tbody tr', (rows) => rows.length);
  check('7. Campaigns list loads', campRowCount >= 1,
    `tbody rows = ${campRowCount}`);
  await snap(page, 'm3_04_campaigns_list.png', 'Campaigns list (table với template thumbnail)');

  // Test 8: Campaign detail
  const firstCampLink = await page.$('tbody tr td:last-child a[href^="/dashboard/campaigns/"]');
  if (firstCampLink) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      firstCampLink.click(),
    ]);
    const onCampDetail = /\/dashboard\/campaigns\/\d+/.test(page.url());
    check('8. Campaign detail navigation', onCampDetail,
      `URL = ${page.url()}`);
    await snap(page, 'm3_05_campaign_detail.png',
      'Campaign detail (template + reports + recent submissions)');
  }

  // Test 9: Campaign create form
  await page.goto(`${BASE_URL}/dashboard/campaigns/new`, { waitUntil: 'networkidle0' });
  const hasFileInput = (await page.$('input[type="file"]')) !== null;
  check('9. Campaign create form có file input', hasFileInput);
  await snap(page, 'm3_06_campaign_new.png',
    'Campaign create form (multipart upload template)');

  await browser.close();

  // Summary
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
