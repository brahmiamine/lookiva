import type { Page, TestInfo } from '@playwright/test';
import { expect, expectNoAxeViolations, expectNoHorizontalScroll, gotoHydrated, isMobile, localeOf, test } from './support';

const open = async (page: Page, info: TestInfo) => {
  const locale = localeOf(info);
  await gotoHydrated(page, `/${locale}/dev/ui`);
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

test('no_horizontal_scroll_at_375_and_320', async ({ page }, info) => {
  test.skip(!isMobile(info), 'mobile projects only');
  await open(page, info);
  await expectNoHorizontalScroll(page, [375, 320]);
});

test('axe_has_no_violations_on_dev_ui_with_dialog_closed_and_open', async ({ page }, info) => {
  await open(page, info);
  await expectNoAxeViolations(page, 'dev/ui');
  await page.getByTestId('dialog-trigger').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoAxeViolations(page, 'dev/ui (dialog open)');
});

test('unprefixed_path_redirects_to_default_locale_and_unknown_page_is_localized_404', async ({ page }, info) => {
  test.skip(info.project.name !== 'fr-desktop' && info.project.name !== 'ar-mobile', 'routing is locale independent');
  const res = await page.goto('/dressing');
  expect(new URL(page.url()).pathname).toBe('/fr/dressing');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  await expect(page).toHaveTitle(/Page introuvable/);
  const api = await page.request.get('/apiary', { maxRedirects: 0 });
  expect(api.status(), '/apiary is a page path, not /api').toBe(307);
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
  await page.locator('h1').click();
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
