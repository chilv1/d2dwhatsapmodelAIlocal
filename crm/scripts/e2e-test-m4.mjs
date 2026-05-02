/**
 * E2E test M4 — Users + RBAC + Audit + Manual Override.
 *
 * Test 3 personas:
 *   - admin (admin@telecombig.pe / admin123)
 *   - branch_manager (manager.lima@telecombig.pe / manager123)
 *   - viewer (viewer@telecombig.pe / viewer123)
 *
 * Chạy: node crm/scripts/e2e-test-m4.mjs
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

async function loginAs(page, email, password) {
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

async function logout(page) {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle0' });
  // Click logout button trong sidebar (aside footer form)
  await page.waitForSelector('aside form button[type="submit"]', { timeout: 5000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
    page.click('aside form button[type="submit"]'),
  ]);
  // Đôi khi NextAuth redirect qua intermediate /signout page → check
  if (page.url().includes('signout')) {
    await page.click('button[type="submit"]').catch(() => {});
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {});
  }
}

async function snap(page, filename, description) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: true });
  console.log(`   📸 ${description}: ${filename}`);
}

async function getMenuItems(page) {
  return page.$$eval('aside nav a', (els) =>
    els.map((el) => el.textContent?.trim().split(/\s+/)[0]),
  );
}

async function main() {
  console.log('🚀 M4 E2E Test — Users + RBAC + Audit + Override\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // ═══════════════════════════════════════════════════
  // PERSONA 1: admin
  // ═══════════════════════════════════════════════════
  console.log('\n— Persona 1: admin —');
  await loginAs(page, 'admin@telecombig.pe', 'admin123');
  check('1. Admin login', page.url().includes('/dashboard'),
    `URL = ${page.url()}`);

  const adminMenu = await getMenuItems(page);
  const hasUsersMenu = adminMenu.some((s) => s?.includes('Users'));
  const hasAuditMenu = adminMenu.some((s) => s?.includes('Audit'));
  check('2. Admin sidebar có "Users + RBAC"', hasUsersMenu, `menu: ${adminMenu.join(',')}`);
  check('3. Admin sidebar có "Audit log"', hasAuditMenu);

  // Test Users page
  await page.goto(`${BASE_URL}/dashboard/users`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table', { timeout: 5000 });
  const userRowCount = await page.$$eval('tbody tr', (rs) => rs.length);
  check('4. Users page lists 3 users', userRowCount === 3, `rows = ${userRowCount}`);
  await snap(page, 'm4_01_users_list_admin.png', 'Users list (admin view)');

  // Test User create form
  await page.goto(`${BASE_URL}/dashboard/users/new`, { waitUntil: 'networkidle0' });
  const hasRoleSelect = (await page.$('select[name="role"]')) !== null;
  check('5. User create form có role select', hasRoleSelect);
  await snap(page, 'm4_02_user_create.png', 'User create form');

  // Test Audit log page
  await page.goto(`${BASE_URL}/dashboard/audit`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table', { timeout: 5000 });
  const auditRowCount = await page.$$eval('tbody tr', (rs) => rs.length);
  check('6. Audit log có entries (>= 1 từ login admin)',
    auditRowCount >= 1, `rows = ${auditRowCount}`);
  await snap(page, 'm4_03_audit_log.png', 'Audit log timeline (admin)');

  // Test override form trên submission detail
  await page.goto(`${BASE_URL}/dashboard/submissions/3`, { waitUntil: 'networkidle0' });
  // submission #3 = rejected, có thể override
  const hasOverrideForm = (await page.$('select[name="new_result"]')) !== null;
  check('7. Submission detail có override form (admin)',
    hasOverrideForm);
  await snap(page, 'm4_04_submission_override.png',
    'Submission detail có override form');

  // Thực hiện override
  if (hasOverrideForm) {
    await page.select('select[name="new_result"]', 'approved');
    await page.type('input[name="reason"]', 'Test override M4 E2E', { delay: 10 });
    // Click submit button của FORM CHỨA select[name=new_result] cụ thể
    // (tránh click nhầm logout button trong sidebar form)
    const overrideBtn = await page.evaluateHandle(() => {
      const select = document.querySelector('select[name="new_result"]');
      const form = select?.closest('form');
      return form?.querySelector('button[type="submit"]') ?? null;
    });
    const isElement = await overrideBtn.evaluate((b) => b !== null);
    if (isElement) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 })
          .catch(() => {}),
        overrideBtn.click(),
      ]);
    }
    // Reload to see override applied
    await page.goto(`${BASE_URL}/dashboard/submissions/3`, { waitUntil: 'networkidle0' });
    const overrideBadge = await page.evaluate(() =>
      document.body?.textContent?.includes('Override') || false,
    );
    check('8. Override saved → badge "Override" visible', overrideBadge);
    await snap(page, 'm4_05_submission_after_override.png',
      'Submission sau khi override (badge Override)');
  }

  // ═══════════════════════════════════════════════════
  // PERSONA 2: branch_manager (Lima)
  // ═══════════════════════════════════════════════════
  console.log('\n— Persona 2: branch_manager (Lima) —');
  await logout(page);
  await loginAs(page, 'manager.lima@telecombig.pe', 'manager123');
  check('9. Branch manager login', page.url().includes('/dashboard'));

  const mgrMenu = await getMenuItems(page);
  const mgrNoUsers = !mgrMenu.some((s) => s?.includes('Users'));
  const mgrNoAudit = !mgrMenu.some((s) => s?.includes('Audit'));
  check('10. Branch manager KHÔNG thấy menu Users', mgrNoUsers,
    `menu: ${mgrMenu.join(',')}`);
  check('11. Branch manager KHÔNG thấy menu Audit', mgrNoAudit);

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle0' });
  await snap(page, 'm4_06_dashboard_branch_manager.png',
    'Dashboard view của branch_manager (scoped data)');

  // Try truy cập /dashboard/users → redirect /dashboard
  await page.goto(`${BASE_URL}/dashboard/users`, { waitUntil: 'networkidle0' });
  const blockedUrl = page.url();
  check('12. Branch manager bị chặn /dashboard/users',
    !blockedUrl.endsWith('/dashboard/users'),
    `URL after = ${blockedUrl}`);

  // ═══════════════════════════════════════════════════
  // PERSONA 3: viewer
  // ═══════════════════════════════════════════════════
  console.log('\n— Persona 3: viewer —');
  await logout(page);
  await loginAs(page, 'viewer@telecombig.pe', 'viewer123');
  check('13. Viewer login', page.url().includes('/dashboard'));

  const viewerMenu = await getMenuItems(page);
  const viewerNoUsers = !viewerMenu.some((s) => s?.includes('Users'));
  check('14. Viewer KHÔNG thấy menu Users', viewerNoUsers);

  // Viewer trên campaigns page → KHÔNG có nút "Tạo campaign mới"
  await page.goto(`${BASE_URL}/dashboard/campaigns`, { waitUntil: 'networkidle0' });
  const createBtnVisible = await page.$$eval('a[href="/dashboard/campaigns/new"]',
    (els) => els.length > 0);
  check('15. Viewer KHÔNG thấy nút "Tạo campaign mới"', !createBtnVisible);
  await snap(page, 'm4_07_campaigns_viewer.png',
    'Campaigns list (viewer - read-only, no create button)');

  // Viewer trên submission detail → KHÔNG có override form
  await page.goto(`${BASE_URL}/dashboard/submissions/3`, { waitUntil: 'networkidle0' });
  const viewerHasOverride = (await page.$('select[name="new_result"]')) !== null;
  check('16. Viewer KHÔNG có override form', !viewerHasOverride);

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
