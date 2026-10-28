import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const localeOf = (info: TestInfo) => String(info.project.metadata.locale);
const open = async (page: Page, info: TestInfo) => {
  const locale = localeOf(info);
  await page.goto(`/${locale}/dev/ui`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return locale;
};
const box = async (loc: ReturnType<Page['locator']>) => {
  const b = await loc.boundingBox();
  if (!b) throw new Error('element has no bounding box');
  return b;
};

test('html_lang_and_dir_match_locale', async ({ page }, info) => {
  const locale = await open(page, info);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', locale);
  await expect(html).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
});

test('calendar_header_order_is_mirrored_in_rtl', async ({ page }, info) => {
  const locale = await open(page, info);
  const heads = page.getByRole('table').locator('thead th');
  await expect(heads).toHaveCount(7);
  const first = await box(heads.first());
  const last = await box(heads.last());
  if (locale === 'ar') expect(first.x).toBeGreaterThan(last.x);
  else expect(first.x).toBeLessThan(last.x);
});

test('no_horizontal_scroll_on_mobile', async ({ page }, info) => {
  test.skip(info.project.name !== 'fr-mobile', 'mobile viewport only');
  await open(page, info);
  const m = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);

  // Exploratory, non-blocking: same measure at 360px. Reported in the task report, never fails the suite.
  await page.setViewportSize({ width: 360, height: 800 });
  const m360 = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  console.log(`[360px exploratory] scrollWidth=${m360.scrollWidth} innerWidth=${m360.innerWidth} overflow=${m360.scrollWidth > m360.innerWidth}`);
});

test('axe_has_no_violations_on_dev_ui', async ({ page }, info) => {
  await open(page, info);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const report = violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  - ${n.target.join(' ')}\n    ${n.failureSummary?.replace(/\n/g, '\n    ')}`).join('\n')}`)
    .join('\n');
  expect(violations, `axe violations:\n${report}`).toHaveLength(0);
});

test('rtl_grid_first_card_is_on_the_right', async ({ page }, info) => {
  const locale = await open(page, info);
  const cards = page.getByTestId('garment-gallery').locator('article');
  const a = await box(cards.nth(0));
  const b = await box(cards.nth(1));
  expect(Math.abs(a.y - b.y), 'first two cards share a row').toBeLessThan(2);
  if (locale === 'ar') expect(a.x).toBeGreaterThan(b.x);
  else expect(a.x).toBeLessThan(b.x);
});

test('keyboard_tab_reaches_dialog_trigger_and_escape_closes', async ({ page }, info) => {
  await open(page, info);
  const trigger = page.getByTestId('dialog-trigger');
  const dialog = page.getByRole('dialog');
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  let reached = false;
  for (let i = 0; i < 100 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await trigger.evaluate((el) => el === document.activeElement);
  }
  expect(reached, 'Tab reaches the dialog trigger').toBe(true);

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  const inside = () => dialog.evaluate((d) => d.contains(document.activeElement));
  expect(await inside(), 'focus starts inside the dialog').toBe(true);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await inside(), `focus stays inside after Tab ${i + 1}`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
