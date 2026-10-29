import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  API, apiLogin, completeOnboarding, expect, expectLangDir, expectNoAxeViolations, expectNoHorizontalScroll, gotoHydrated, isMobile, localeOf, m, test, verifiedAccount,
} from './support';

// Images are generated in-test (no binary fixture in the repo).
const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: '#c9a67a' } }).jpeg().toBuffer();

async function signedIn(page: Page, locale: string) {
  const email = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, email);
  await completeOnboarding(page.request, locale);
}

async function apiGarment(request: APIRequestContext, nickname: string, extra: Record<string, unknown> = {}) {
  const r = await request.post('/api/v1/garments', {
    headers: { ...API, 'Idempotency-Key': randomUUID() },
    data: { nickname, categoryCode: 'TOPS', subtypeCode: 'TSHIRT', primaryColor: { code: 'BLACK' }, ...extra },
  });
  expect(r.status(), 'create garment').toBe(201);
  return (await r.json()) as { id: string; version: number };
}

async function apiPhoto(request: APIRequestContext, garmentId: string) {
  const r = await request.post(`/api/v1/garments/${garmentId}/photos`, { headers: API, multipart: { file: { name: 'p.jpg', mimeType: 'image/jpeg', buffer: await jpeg() } } });
  expect(r.status(), `upload photo: ${await r.text()}`).toBe(201);
}

const card = (page: Page, name: string) => page.getByTestId('garments').locator('li').filter({ hasText: name });

test('wardrobe_journey_create_photo_status_duplicate_bulk_trash_restore', async ({ page }, info) => {
  test.skip(!['fr-desktop', 'ar-mobile'].includes(info.project.name), 'heavy flow on two projects');
  test.setTimeout(150_000);
  const locale = localeOf(info);
  const t = (k: string) => m(locale, `wardrobe.${k}`);
  const applyName = new RegExp(`^${t('bulk.confirm').split('{')[0]!.trim()}`);
  await signedIn(page, locale);

  await gotoHydrated(page, `/${locale}/dressing`);
  await expect(page.getByRole('heading', { name: t('emptyTitle') })).toBeVisible();
  await expect(page.getByRole('navigation', { name: m(locale, 'nav.label') }).getByRole('link', { name: m(locale, 'nav.dressing') })).toHaveAttribute('aria-current', 'page');

  // Create.
  await page.getByRole('link', { name: t('add') }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dressing/new$`));
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  await page.getByLabel(t('form.nickname')).fill('Trench e2e');
  await page.getByLabel(`${t('form.category')} *`).selectOption('OUTERWEAR');
  await page.getByLabel(`${t('form.subtype')} *`).selectOption('COAT');
  await page.getByLabel(`${t('form.primaryColor')} *`).selectOption('BEIGE');
  await page.getByLabel(m(locale, 'wardrobe.weather.rain.label')).selectOption('WATERPROOF');
  await page.getByRole('button', { name: t('form.create') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dressing/[0-9a-f-]{36}\\?created=1$`));
  const firstId = /dressing\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await expect(page.getByRole('status').filter({ hasText: t('sheet.createdTitle') })).toBeVisible();
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });

  // Photo: gallery picker, rotate, upload with progress, shown once stored.
  await page.getByLabel(t('photos.gallery')).setInputFiles({ name: 'trench.jpg', mimeType: 'image/jpeg', buffer: await jpeg() });
  await page.getByRole('button', { name: t('photos.rotateRight') }).click();
  await page.getByRole('button', { name: t('photos.upload') }).click();
  await expect(page.getByRole('status').filter({ hasText: t('photos.uploaded') })).toBeVisible();
  const main = page.locator('img[data-slot="photo"]').first();
  await expect(main).toBeVisible();
  await expect.poll(() => main.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText(t('photos.primary'), { exact: true })).toBeVisible();

  // Status change with history.
  await page.getByLabel(t('sheet.newStatus')).selectOption('TO_WASH');
  await page.getByRole('button', { name: t('sheet.changeStatus') }).click();
  await expect(page.getByRole('status').filter({ hasText: t('status.TO_WASH') }).first()).toBeVisible();
  await expect(page.getByTestId('status-history').locator('li')).toHaveCount(2);

  // Duplicate: prefilled editable form, confirmation, photos copied.
  await page.getByRole('link', { name: t('sheet.duplicate') }).click();
  await expect(page).toHaveURL(new RegExp(`/new\\?from=${firstId}$`));
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  await expect(page.getByLabel(t('form.nickname'))).toHaveValue('Trench e2e');
  await page.getByLabel(t('form.nickname')).fill('Trench copie');
  await page.getByRole('button', { name: t('form.duplicate') }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText(t('form.confirmDuplicateWithPhotos'));
  await confirm.getByRole('button', { name: t('form.duplicate') }).click();
  await expect(page).toHaveURL(/\?created=1$/);
  expect(page.url()).not.toContain(firstId);
  await expect(page.getByRole('heading', { level: 1, name: 'Trench copie' })).toBeVisible();
  await expect(page.locator('img[data-slot="photo"]').first()).toBeVisible();

  // Gallery: two independent garments, thumbnails, statuses.
  await gotoHydrated(page, `/${locale}/dressing`);
  await expect(page.getByTestId('garments').locator('li')).toHaveCount(2);
  await expect(card(page, 'Trench e2e')).toContainText(t('status.TO_WASH'));
  await expect(card(page, 'Trench copie')).toContainText(t('status.AVAILABLE'));
  await expect(card(page, 'Trench copie').locator('img[data-slot="photo"]')).toBeVisible();

  // Bulk status on both.
  await page.getByRole('button', { name: t('select.start') }).click();
  await page.getByRole('checkbox', { name: new RegExp('Trench e2e') }).check();
  await page.getByRole('checkbox', { name: new RegExp('Trench copie') }).check();
  await page.getByRole('region', { name: t('select.bar') }).getByRole('button', { name: t('bulk.status') }).click();
  await page.getByRole('dialog').getByLabel(t('filters.status')).selectOption('LENT');
  await page.getByRole('dialog').getByRole('button', { name: applyName }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(card(page, 'Trench e2e')).toContainText(t('status.LENT'));
  await expect(card(page, 'Trench copie')).toContainText(t('status.LENT'));

  // Filters persist in the URL.
  await gotoHydrated(page, `/${locale}/dressing?status=AVAILABLE`);
  await expect(page.getByRole('heading', { name: t('noMatchTitle') })).toBeVisible();
  await gotoHydrated(page, `/${locale}/dressing?status=LENT&q=copie`);
  await expect(page.getByTestId('garments').locator('li')).toHaveCount(1);
  await expect(page.getByRole('searchbox', { name: t('filters.search') })).toHaveValue('copie');

  // Bulk delete -> trash -> restore.
  await gotoHydrated(page, `/${locale}/dressing`);
  await page.getByRole('button', { name: t('select.start') }).click();
  await page.getByRole('checkbox', { name: new RegExp('Trench copie') }).check();
  await page.getByRole('region', { name: t('select.bar') }).getByRole('button', { name: t('bulk.delete') }).click();
  await page.getByRole('dialog').getByRole('button', { name: applyName }).click();
  await expect(page.getByTestId('garments').locator('li')).toHaveCount(1);

  await page.getByRole('link', { name: t('trash.short') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dressing/trash$`));
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  const row = page.getByTestId('trash').locator('li').filter({ hasText: 'Trench copie' });
  await expect(row).toContainText(/30|٣٠|29|٢٩/);
  await row.getByRole('button').click();
  await expect(page.getByRole('status').filter({ hasText: t('trash.restoredTitle') })).toBeVisible();
  await expect(page.getByRole('heading', { name: t('trash.emptyTitle') })).toBeVisible();
  await gotoHydrated(page, `/${locale}/dressing`);
  await expect(page.getByTestId('garments').locator('li')).toHaveCount(2);
});

test('wardrobe_screens_pass_axe_and_reflow', async ({ page }, info) => {
  test.skip(info.project.name === 'en-desktop', 'fr and ar');
  const locale = localeOf(info);
  await signedIn(page, locale);
  const g = await apiGarment(page.request, 'Chemise lin', { purchasePrice: 49.9, purchaseCurrency: 'EUR', notes: 'Taille 38' });
  await apiPhoto(page.request, g.id);
  const trashed = await apiGarment(page.request, 'Vieux pull');
  expect((await page.request.delete(`/api/v1/garments/${trashed.id}`, { headers: API })).status()).toBe(204);

  for (const [path, title] of [
    ['dressing', 'wardrobe.title'],
    ['dressing/new', 'wardrobe.form.createTitle'],
    [`dressing/${g.id}`, 'wardrobe.sheet.title'],
    ['dressing/trash', 'wardrobe.trash.title'],
    ['dressing/organize', 'wardrobe.organize.title'],
  ] as const) {
    await gotoHydrated(page, `/${locale}/${path}`);
    await expectLangDir(page, locale);
    await expect(page).toHaveTitle(new RegExp(m(locale, title)));
    if (path === 'dressing') await expect(page.getByTestId('garments').locator('img[data-slot="photo"]')).toBeVisible();
    if (path === `dressing/${g.id}`) await expect(page.getByTestId('status-history').locator('li')).toHaveCount(1);
    if (path === 'dressing/trash') await expect(page.getByTestId('trash').locator('li')).toHaveCount(1);
    await expectNoAxeViolations(page, `${locale} ${path}`);
    if (isMobile(info)) {
      await expectNoHorizontalScroll(page);
      await page.setViewportSize({ width: 375, height: 812 });
    }
  }
});

test('missing_image_falls_back_to_the_illustration', async ({ page }, info) => {
  test.skip(!['fr-desktop', 'ar-mobile'].includes(info.project.name), 'two projects');
  const locale = localeOf(info);
  await signedIn(page, locale);
  const g = await apiGarment(page.request, 'Sans image');
  await apiPhoto(page.request, g.id);
  await page.route('**/photos/*/file**', (r) => r.fulfill({ status: 404, body: '' }));
  await gotoHydrated(page, `/${locale}/dressing`);
  const c = card(page, 'Sans image');
  await expect(c.locator('[data-slot="placeholder"]')).toBeVisible();
  await expect(c.locator('img')).toHaveCount(0);
  await gotoHydrated(page, `/${locale}/dressing/${g.id}`);
  await expect(page.locator('[data-slot="placeholder"]').first()).toBeVisible();
});

test('organize_lists_and_attach_from_the_sheet', async ({ page }, info) => {
  test.skip(!['fr-desktop', 'ar-mobile'].includes(info.project.name), 'two projects');
  const locale = localeOf(info);
  const o = (k: string) => m(locale, `wardrobe.organize.${k}`);
  await signedIn(page, locale);
  const g = await apiGarment(page.request, 'Jean brut');
  await gotoHydrated(page, `/${locale}/dressing/organize`);
  await page.getByLabel(o('newName.tags')).fill('Bureau');
  await page.getByRole('button', { name: o('create') }).first().click();
  await expect(page.getByText('Bureau', { exact: true })).toBeVisible();

  await gotoHydrated(page, `/${locale}/dressing/${g.id}`);
  const chip = page.getByRole('button', { name: 'Bureau' });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');

  await gotoHydrated(page, `/${locale}/dressing/organize`);
  await page.getByText(o('viewMembers')).first().click();
  await expect(page.getByRole('link', { name: 'Jean brut' })).toBeVisible();
});
