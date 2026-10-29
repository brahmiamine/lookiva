import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  API, apiLogin, completeOnboarding, expect, expectLangDir, expectNoAxeViolations, expectNoHorizontalScroll, gotoHydrated, localeOf, m, test, verifiedAccount,
} from './support';

const DAY = '2026-11-20'; // Europe/Paris (onboarding zone), UTC+1 in November

async function signedIn(page: Page, locale: string) {
  const email = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, email);
  await completeOnboarding(page.request, locale);
}

async function apiGarment(request: APIRequestContext, nickname: string, categoryCode: string, subtypeCode: string) {
  const r = await request.post('/api/v1/garments', { headers: { ...API, 'Idempotency-Key': randomUUID() }, data: { nickname, categoryCode, subtypeCode, primaryColor: { code: 'BLACK' } } });
  expect(r.status(), 'create garment').toBe(201);
  return (await r.json()) as { id: string };
}

async function apiOutfit(request: APIRequestContext, title: string, hour: string, items: { garmentId: string; role: string }[]) {
  const r = await request.post('/api/v1/outfits', {
    headers: { ...API, 'Idempotency-Key': randomUUID() },
    data: { title, occasion: 'Sortie', startsAt: `${DAY}T${hour}:00+01:00`, timezone: 'Europe/Paris', status: 'PLANNED', items },
  });
  expect(r.status(), `create outfit: ${await r.text()}`).toBe(201);
  return (await r.json()) as { id: string };
}

const card = (page: Page, name: string) => page.getByTestId('garments').locator('li').filter({ hasText: name });

test('outfits_journey_three_a_day_plan_worn_optional_partial_wash_cancel_template', async ({ page }, info) => {
  test.skip(!['fr-desktop', 'ar-mobile'].includes(info.project.name), 'heavy flow on two projects');
  test.setTimeout(180_000);
  const locale = localeOf(info);
  const t = (k: string) => m(locale, `outfits.${k}`);
  const st = (s: string) => m(locale, `wardrobe.status.${s}`);
  await signedIn(page, locale);
  const names = ['Tee e2e', 'Jean e2e', 'Basket e2e', 'Manteau e2e'];
  const [tee, jean] = [await apiGarment(page.request, names[0]!, 'TOPS', 'TSHIRT'), await apiGarment(page.request, names[1]!, 'BOTTOMS', 'JEANS')];
  await apiGarment(page.request, names[2]!, 'FOOTWEAR', 'SNEAKERS');
  await apiGarment(page.request, names[3]!, 'OUTERWEAR', 'COAT');

  // Nav entry + empty day.
  await gotoHydrated(page, `/${locale}/tenues?view=day&date=${DAY}`);
  await expectLangDir(page, locale);
  await expect(page.getByRole('navigation', { name: m(locale, 'nav.label') }).getByRole('link', { name: m(locale, 'nav.outfits') })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: t('dayEmptyTitle') })).toBeVisible();

  // Create + plan through the editor with the 4 garments (picker), then 2 more outfits the same day through the API.
  await page.getByRole('link', { name: t('new') }).click();
  await expect(page).toHaveURL(new RegExp(`/tenues/new\\?date=${DAY}$`));
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  await page.getByLabel(t('editor.title')).fill('Bureau e2e');
  await page.getByLabel(t('editor.occasion')).fill('Travail');
  await page.getByLabel(t('editor.start'), { exact: true }).fill('09:00');
  for (const n of names) {
    await page.getByRole('button', { name: t('editor.addGarment') }).click();
    const picker = page.getByRole('dialog', { name: t('picker.title') });
    await picker.getByRole('button', { name: new RegExp(n) }).click();
    await expect(picker).toBeHidden();
  }
  await expect(page.getByTestId('outfit-items').locator('li')).toHaveCount(4);
  await page.getByRole('button', { name: t('editor.plan'), exact: true }).click();
  await expect(page).toHaveURL(/\/tenues\/[0-9a-f-]{36}\?created=1$/);
  const firstUrl = page.url().replace(/\?.*$/, '');
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  await expect(page.getByText(t('status.PLANNED')).first()).toBeVisible();
  await apiOutfit(page.request, 'Midi e2e', '12:30', [{ garmentId: tee.id, role: 'TOP' }]);
  const evening = await apiOutfit(page.request, 'Soir e2e', '19:00', [{ garmentId: jean.id, role: 'BOTTOM' }]);

  await gotoHydrated(page, `/${locale}/tenues?view=day&date=${DAY}`);
  const rows = page.locator('a[data-outfit]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Bureau e2e');
  await expect(rows.nth(1)).toContainText('Midi e2e');
  await expect(rows.nth(2)).toContainText('Soir e2e');
  await page.getByRole('button', { name: t('views.week') }).click();
  await expect(page.locator(`[data-date="${DAY}"] a[data-outfit]`)).toHaveCount(3);

  // Confirm worn: the optional panel opens with nothing checked; skipping changes nothing.
  await gotoHydrated(page, firstUrl);
  await page.getByRole('button', { name: t('editor.markWorn') }).click();
  let wash = page.getByRole('dialog', { name: t('wash.title') });
  await expect(wash).toBeVisible();
  await expect(wash.getByRole('checkbox')).toHaveCount(4);
  for (const box of await wash.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  await wash.getByRole('button', { name: t('wash.skip') }).click();
  await expect(wash).toBeHidden();
  await expect(page.getByText(t('status.WORN')).first()).toBeVisible();

  await gotoHydrated(page, `/${locale}/dressing`);
  for (const n of names) await expect(card(page, n)).toContainText(st('AVAILABLE'));

  // Later: wash 2 of the 4 -> exactly those 2 are TO_WASH.
  await gotoHydrated(page, firstUrl);
  await page.getByRole('button', { name: t('editor.chooseWash') }).click();
  wash = page.getByRole('dialog', { name: t('wash.title') });
  await wash.getByRole('checkbox', { name: new RegExp(names[0]!) }).check();
  await wash.getByRole('checkbox', { name: new RegExp(names[2]!) }).check();
  await wash.getByRole('button').first().click();
  await expect(wash.getByTestId('wash-results')).toContainText(names[0]!);
  await expect(wash.getByTestId('wash-results')).toContainText(names[2]!);
  await gotoHydrated(page, `/${locale}/dressing`);
  await expect(card(page, names[0]!)).toContainText(st('TO_WASH'));
  await expect(card(page, names[2]!)).toContainText(st('TO_WASH'));
  await expect(card(page, names[1]!)).toContainText(st('AVAILABLE'));
  await expect(card(page, names[3]!)).toContainText(st('AVAILABLE'));

  // Garment sheet: the confirmed wear date.
  await gotoHydrated(page, `/${locale}/dressing/${tee.id}`);
  await expect(page.getByTestId('last-worn-dates').locator('li')).toHaveCount(1);

  // Cancel (never a hard delete).
  await gotoHydrated(page, `/${locale}/tenues/${evening.id}`);
  await page.getByRole('button', { name: t('editor.cancel') }).click();
  await page.getByRole('dialog').getByRole('button', { name: t('editor.cancel') }).click();
  await expect(page.getByRole('status').filter({ hasText: t('editor.cancelledTitle') })).toBeVisible();
  await expect(page.getByText(t('status.CANCELLED')).first()).toBeVisible();

  // Template: save, instantiate to a new date; the original outfit is untouched.
  await gotoHydrated(page, firstUrl);
  await page.getByRole('button', { name: t('editor.saveAsTemplate') }).click();
  const dlg = page.getByRole('dialog', { name: t('editor.templateTitle') });
  await dlg.getByLabel(t('editor.templateName')).fill('Modèle e2e');
  await dlg.getByRole('button', { name: t('editor.saveAsTemplate') }).click();
  await expect(page.getByRole('status').filter({ hasText: t('editor.templateSaved') })).toBeVisible();
  await gotoHydrated(page, `/${locale}/tenues/modeles`);
  await page.getByRole('button', { name: m(locale, 'outfits.templates.useOne').replace('{name}', 'Modèle e2e') }).click();
  const use = page.getByRole('dialog');
  await use.getByLabel(t('templates.date')).fill('2026-11-27');
  await use.getByRole('button', { name: t('templates.create') }).click();
  await expect(page).toHaveURL(/\/tenues\/[0-9a-f-]{36}\?created=1$/);
  expect(page.url()).not.toContain(firstUrl);
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  await expect(page.getByTestId('outfit-items').locator('li')).toHaveCount(4);
  await gotoHydrated(page, firstUrl);
  await expect(page.getByText(t('status.WORN')).first()).toBeVisible();
});

test('outfits_screens_pass_axe_and_reflow', async ({ page }, info) => {
  test.skip(info.project.name === 'en-desktop', 'fr and ar');
  test.setTimeout(120_000);
  const locale = localeOf(info);
  const t = (k: string) => m(locale, `outfits.${k}`);
  await signedIn(page, locale);
  const g = await apiGarment(page.request, 'Tee axe', 'TOPS', 'TSHIRT');
  const o = await apiOutfit(page.request, 'Axe e2e', '09:00', [{ garmentId: g.id, role: 'TOP' }]);
  await apiOutfit(page.request, 'Axe bis', '09:30', [{ garmentId: g.id, role: 'TOP' }]); // same garment, overlapping: a conflict

  for (const view of ['day', 'week']) {
    await gotoHydrated(page, `/${locale}/tenues?view=${view}&date=${DAY}`);
    await expect(page.locator('a[data-outfit]').first()).toBeVisible();
    await expectNoAxeViolations(page, `tenues ${view} ${locale}`);
    await expectNoHorizontalScroll(page);
  }
  await gotoHydrated(page, `/${locale}/tenues/${o.id}`);
  await expect(page.getByTestId('conflicts')).toBeVisible();
  await expectNoAxeViolations(page, `editor ${locale}`);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: t('editor.addGarment') }).click();
  await expect(page.getByRole('dialog', { name: t('picker.title') })).toBeVisible();
  await expectNoAxeViolations(page, `picker dialog ${locale}`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: t('editor.addGarment') })).toBeFocused(); // focus returns to the opener
  await page.getByRole('button', { name: t('editor.markWorn') }).click();
  await expect(page.getByRole('dialog', { name: t('wash.title') })).toBeVisible();
  await expectNoAxeViolations(page, `wash dialog ${locale}`);
  await gotoHydrated(page, `/${locale}/tenues/new`);
  await expectNoAxeViolations(page, `new outfit ${locale}`);
  await gotoHydrated(page, `/${locale}/tenues/modeles`);
  await expectNoAxeViolations(page, `templates ${locale}`);
  await expectNoHorizontalScroll(page);
});
