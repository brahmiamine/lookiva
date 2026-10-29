import { test, expect, API, expectLangDir, expectNoAxeViolations, expectNoHorizontalScroll, gotoHydrated, localeOf, m } from './support';
import { verifiedAccount, apiLogin, completeOnboarding } from './support';

test('private trilingual search prepares an outfit without saving it', async ({ page }, info) => {
  const locale = localeOf(info);
  const account = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, account);
  await completeOnboarding(page.request, locale);
  const created = await page.request.post('/api/v1/garments', {
    headers: { ...API, 'Idempotency-Key': crypto.randomUUID() },
    data: { nickname: 'Sneaker test', categoryCode: 'FOOTWEAR', subtypeCode: 'SNEAKERS', primaryColor: { code: 'BLACK' } },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const before = await (await page.request.get('/api/v1/outfits')).json();
  await gotoHydrated(page, `/${locale}/recherche`);
  await expectLangDir(page, locale);
  const query = { fr: 'baskets noires', en: 'black sneakers', ar: 'حذاء رياضي أسود' }[locale];
  await page.getByLabel(m(locale, 'search.query'), { exact: true }).fill(query);
  await page.getByRole('button', { name: m(locale, 'search.submit'), exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sneaker test', exact: true })).toBeVisible();
  await expectNoAxeViolations(page, `search ${locale}`);
  await expectNoHorizontalScroll(page);
  await page.getByRole('checkbox', { name: 'Sneaker test', exact: true }).check();
  await page.getByRole('button', { name: m(locale, 'search.prepare').replace('{count}', '1') }).click();
  await expect(page).toHaveURL(new RegExp(`/tenues/new\\?garments=${id}`));
  await expect(page.getByTestId('outfit-items')).toContainText('Sneaker test');
  const after = await (await page.request.get('/api/v1/outfits')).json();
  expect(after.items).toHaveLength(before.items.length);
});
