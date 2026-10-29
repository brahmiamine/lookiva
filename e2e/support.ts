import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type APIRequestContext, type Browser, type Page, type TestInfo } from '@playwright/test';
import { readOutbox } from '@/platform/email/outbox';
import { createDb } from '@/platform/db';

// ---------------------------------------------------------------- per-test client address
// The e2e server runs with TRUST_PROXY=true: the rightmost X-Forwarded-For is the client. Each test gets its own
// address, so the per-IP limits (register 5/h, login 30/15 min...) behave per test, not per suite.
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

export const test = base.extend<{ clientIp: string }>({
  clientIp: async ({}, provide) => provide(randomIp()),
  extraHTTPHeaders: async ({ clientIp }, provide) => provide({ 'X-Forwarded-For': clientIp }),
});
export { expect };

// Catalogs read from disk (Playwright's ESM loader needs import attributes for JSON): visible strings are asserted
// through the same messages the UI renders, so one test runs in fr, en and ar.
type Locale = 'fr' | 'en' | 'ar';
const CATALOGS = Object.fromEntries(
  (['fr', 'en', 'ar'] as const).map((l) => [l, JSON.parse(readFileSync(new URL(`../src/i18n/messages/${l}.json`, import.meta.url), 'utf8'))]),
) as Record<Locale, Record<string, unknown>>;
export const m = (locale: Locale, key: string): string => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], CATALOGS[locale]);
  if (typeof v !== 'string') throw new Error(`missing message ${key}`);
  return v;
};

export const localeOf = (info: TestInfo) => String(info.project.metadata.locale) as Locale;
export const isMobile = (info: TestInfo) => Boolean(info.project.metadata.mobile);
export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${randomBytes(3).toString('hex')}@example.test`;
export const PASSWORD = 'une phrase facile 2026';
export const API = { 'X-Requested-With': 'lookiva' };

/** Opens a page and waits until React has hydrated it (the layout's HydrationMarker sets html[data-hydrated]). */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
}

/** Zero axe violations for WCAG 2.0/2.1/2.2 A+AA, with a readable report. */
export async function expectNoAxeViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const report = violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  - ${n.target.join(' ')}`).join('\n')}`)
    .join('\n');
  expect(violations, `axe violations on ${label}:\n${report}`).toHaveLength(0);
}

/** No horizontal scroll at the given widths (WCAG 1.4.10 reflow at 320 CSS px). */
export async function expectNoHorizontalScroll(page: Page, widths = [375, 320]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(m.sw, `scrollWidth at ${width}px`).toBeLessThanOrEqual(m.iw);
  }
}

export async function expectLangDir(page: Page, locale: string) {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

// ---------------------------------------------------------------- dev outbox (EMAIL_TRANSPORT=outbox only)
// Reads the outbox table directly with the existing dev/test helper `readOutbox` (it refuses to run in production).
// No HTTP route exists for it, so nothing is reachable from a browser.
// ponytail: one pool per worker, closed when the worker exits.
let db: ReturnType<typeof createDb> | undefined;
export async function latestMailLink(to: string, kind: 'verify-email' | 'reset-password'): Promise<string> {
  db ??= createDb(process.env.E2E_DATABASE_URL ?? '');
  for (let i = 0; i < 20; i++) {
    const link = (await readOutbox(db, to))
      .map((m) => /https?:\/\/\S+/.exec(m.text)?.[0] ?? '')
      .filter((l) => l.includes(`/${kind}#token=`))
      .at(-1);
    if (link) return new URL(link).pathname + new URL(link).hash; // relative: same origin as the test server
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} mail for ${to}`);
}

// ---------------------------------------------------------------- fast account setup through the real API
/** Registers and verifies an account through the HTTP API (used where the UI flow itself is not under test). */
export async function verifiedAccount(request: APIRequestContext, locale: string, email = uniqueEmail('acct')) {
  const r = await request.post('/api/v1/auth/register', {
    headers: { ...API, 'Idempotency-Key': randomBytes(12).toString('hex') },
    data: { email, password: PASSWORD, locale },
  });
  expect(r.status()).toBe(202);
  const token = (await latestMailLink(email, 'verify-email')).split('#token=')[1];
  expect((await request.post('/api/v1/auth/email/verify', { headers: API, data: { token } })).status()).toBe(200);
  return email;
}

/** Logs in through the API on this request context (cookie stored on its browser context when it is page.request). */
export async function apiLogin(request: APIRequestContext, email: string, password = PASSWORD) {
  const r = await request.post('/api/v1/auth/login', { headers: API, data: { email, password } });
  expect(r.status(), 'login').toBe(200);
}

export async function completeOnboarding(request: APIRequestContext, locale: string, cityName = 'Lyon') {
  const r = await request.post('/api/v1/me/onboarding', { headers: API, data: { locale, cityName, timezone: 'Europe/Paris' } });
  expect(r.status(), 'onboarding').toBe(200);
}

/** A second, independent browser (own cookies, own client address), like another device. */
export async function otherDevice(browser: Browser, info: TestInfo) {
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL),
    locale: info.project.use.locale,
    extraHTTPHeaders: { 'X-Forwarded-For': randomIp() },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/140.0',
  });
  return { context, page: await context.newPage() };
}

/** Tabs from the current focus until `target` is focused (fails after 60 presses). */
export async function tabTo(page: Page, target: ReturnType<Page['locator']>, key: 'Tab' | 'Shift+Tab' = 'Tab') {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(key);
  }
  throw new Error('target never received focus by keyboard');
}
