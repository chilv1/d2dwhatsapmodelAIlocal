/**
 * E2E test M2 — login flow + dashboard render + screenshot.
 * Chạy: node crm/scripts/e2e-test.mjs
 *
 * Test cases:
 *   1. GET /login → 200, có form
 *   2. GET /dashboard chưa login → redirect 307 to /login
 *   3. POST credentials login OK → redirect /dashboard
 *   4. GET /dashboard sau login → 200 với content "Welcome"
 *   5. Click logout → quay về /login
 *
 * Screenshots lưu tại data/screenshots/m2_*.png
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

async function main() {
  console.log('🚀 M2 E2E Test — Login + Dashboard\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // ── Test 1: GET /login ──────────────────────────────
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  const title = await page.title();
  check('1. /login renders', title.includes('Telecom Big'), `title="${title}"`);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/m2_01_login.png`,
    fullPage: true,
  });
  console.log(`   📸 ${SCREENSHOT_DIR}/m2_01_login.png`);

  const hasForm = (await page.$('form')) !== null;
  const hasEmailInput = (await page.$('input[name="email"]')) !== null;
  const hasPasswordInput = (await page.$('input[name="password"]')) !== null;
  check('2. Login form có đủ fields',
    hasForm && hasEmailInput && hasPasswordInput,
    `form=${hasForm} email=${hasEmailInput} password=${hasPasswordInput}`);

  // ── Test 3: GET /dashboard chưa login → redirect ──
  const dashRes = await page.goto(`${BASE_URL}/dashboard`, {
    waitUntil: 'networkidle0',
  });
  check('3. /dashboard redirect to /login khi chưa auth',
    page.url().includes('/login'),
    `final URL = ${page.url()}, status = ${dashRes?.status()}`);

  // ── Test 4: Login flow ─────────────────────────────
  await page.type('input[name="email"]', 'admin@telecombig.pe', { delay: 30 });
  // Email đã có default value, clear trước khi type
  await page.evaluate(() => {
    document.querySelector('input[name="email"]').value = '';
  });
  await page.type('input[name="email"]', 'admin@telecombig.pe', { delay: 30 });
  await page.type('input[name="password"]', 'admin123', { delay: 30 });

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/m2_02_login_filled.png`,
    fullPage: true,
  });
  console.log(`   📸 ${SCREENSHOT_DIR}/m2_02_login_filled.png`);

  // Submit + chờ navigation
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  check('4. Login redirect to /dashboard',
    page.url().includes('/dashboard'),
    `URL after login = ${page.url()}`);

  // ── Test 5: Dashboard render ───────────────────────
  await page.waitForSelector('h1', { timeout: 5000 });
  const heading = await page.$eval('h1', (el) => el.textContent);
  check('5. Dashboard có heading Welcome',
    heading?.includes('Welcome'),
    `h1 = "${heading}"`);

  const hasSidebar = (await page.$('aside')) !== null;
  check('6. Sidebar render', hasSidebar);

  const navLinkCount = await page.$$eval('aside nav a', (els) => els.length);
  check('7. Sidebar có 7 menu items', navLinkCount === 7,
    `count = ${navLinkCount}`);

  const cardCount = await page.$$eval('.grid > div', (els) => els.length);
  check('8. Dashboard có ít nhất 6 stat cards', cardCount >= 6,
    `count = ${cardCount}`);

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/m2_03_dashboard.png`,
    fullPage: true,
  });
  console.log(`   📸 ${SCREENSHOT_DIR}/m2_03_dashboard.png`);

  // ── Test 6: Logout ─────────────────────────────────
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
    page.click('aside form button[type="submit"]'),
  ]);
  // NextAuth signout có thể qua intermediate page → click confirm nếu có
  if (page.url().includes('signout')) {
    await page.waitForSelector('button[type="submit"]', { timeout: 3000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]'),
    ]);
  }
  check('9. Logout redirect về /login',
    page.url().includes('/login') || page.url() === BASE_URL + '/',
    `URL = ${page.url()}`);

  // ── Test 7: Sai password ───────────────────────────
  if (!page.url().includes('/login')) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  }
  await page.evaluate(() => {
    document.querySelector('input[name="email"]').value = '';
  });
  await page.type('input[name="email"]', 'admin@telecombig.pe', { delay: 20 });
  await page.type('input[name="password"]', 'wrongpassword', { delay: 20 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  const stillLogin = page.url().includes('/login');
  const errorVisible = await page.$eval('body', (el) =>
    el.textContent?.includes('không đúng') || el.textContent?.includes('CredentialsSignin'),
  ).catch(() => false);
  check('10. Sai password → ở lại /login (có thể có error)',
    stillLogin, `URL = ${page.url()}, error visible = ${errorVisible}`);
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/m2_04_login_error.png`,
    fullPage: true,
  });
  console.log(`   📸 ${SCREENSHOT_DIR}/m2_04_login_error.png`);

  await browser.close();

  // ── Summary ─────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Result: ${passed}/${total} ${passed === total ? '✅ ALL PASS' : `⚠ ${total - passed} FAILED`}`);

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
