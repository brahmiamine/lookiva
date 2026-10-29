import {
  API,
  PASSWORD,
  apiLogin,
  completeOnboarding,
  expect,
  expectLangDir,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  gotoHydrated,
  isMobile,
  latestMailLink,
  localeOf,
  m,
  otherDevice,
  tabTo,
  test,
  uniqueEmail,
  verifiedAccount,
} from './support';


test('journey_register_verify_onboard_profile_sessions', async ({ page }, info) => {
  const locale = localeOf(info);
  const email = uniqueEmail('journey');

  await gotoHydrated(page, `/${locale}/register`);
  await expectLangDir(page, locale);
  await expect(page).toHaveTitle(new RegExp(m(locale, 'auth.register.title')));
  await page.getByLabel(m(locale, 'common.email')).fill(email);
  await page.getByLabel(m(locale, 'common.password'), { exact: true }).fill(PASSWORD);
  await expect(page.getByRole('status').filter({ hasText: m(locale, 'auth.password.strongMeter') })).toBeVisible();
  await page.getByLabel(m(locale, 'auth.password.confirm')).fill(PASSWORD);
  await page.getByLabel(m(locale, 'auth.register.terms')).check();
  await page.getByRole('button', { name: m(locale, 'auth.register.submit') }).click();

  // Anti-enumeration wording, the address shown isolated (Bdi), resend on cooldown.
  await expect(page).toHaveURL(new RegExp(`/${locale}/verify-email$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m(locale, 'auth.verify.title'));
  await expect(page.getByTestId('pending-email').locator('bdi')).toHaveText(email);
  await expect(page.getByRole('button', { name: /60|5\d/ })).toHaveAttribute('aria-disabled', 'true');

  // Mail link: token in the fragment; it is stripped from the URL once read.
  const link = await latestMailLink(email, 'verify-email');
  expect(link).toMatch(new RegExp(`^/${locale}/verify-email#token=`));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await gotoHydrated(page, link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m(locale, 'auth.verify.successTitle'));
  expect(page.url()).not.toContain('token');
  expect(requests.filter((u) => u.includes('token=')), 'token never in a request URL').toEqual([]);

  await page.getByRole('link', { name: m(locale, 'auth.verify.continue') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  await page.getByLabel(m(locale, 'common.email')).fill(email);
  await page.getByLabel(m(locale, 'common.password'), { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: m(locale, 'auth.login.submit') }).click();

  // Onboarding: exactly two inputs to complete (language, city).
  await expect(page).toHaveURL(new RegExp(`/${locale}/onboarding`));
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(page.getByRole('radio', { checked: true })).toHaveAttribute('value', locale);
  await page.getByRole('button', { name: m(locale, 'onboarding.continue') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m(locale, 'onboarding.cityTitle'));
  await page.getByLabel(m(locale, 'onboarding.search')).fill('Lyon');
  await expect(page.getByRole('radio').first()).toBeChecked();
  await page.getByRole('button', { name: m(locale, 'onboarding.finish') }).click();

  // Profile: AI off by default with the "no photo" statement; save a change.
  await expect(page).toHaveURL(new RegExp(`/${locale}/settings/profile$`));
  await expect(page.getByRole('switch', { name: m(locale, 'settings.profile.aiTitle') })).not.toBeChecked();
  await expect(page.getByText(m(locale, 'settings.profile.aiText'))).toBeVisible();
  await page.getByRole('radio', { name: m(locale, 'settings.profile.COLD') }).check();
  await expect(page.getByText(m(locale, 'settings.profile.dirty'))).toBeVisible();
  await page.getByRole('button', { name: m(locale, 'settings.profile.save') }).click();
  await expect(page.getByRole('status').filter({ hasText: m(locale, 'settings.profile.savedAt').split('{')[0]!.trim() })).toBeVisible();
  const prefs = await (await page.request.get('/api/v1/me/preferences')).json();
  expect(prefs).toMatchObject({ thermalSensitivity: 'COLD', aiEnabled: false, cityName: expect.any(String), locale });

  await page.getByRole('link', { name: m(locale, 'settings.profile.sessions') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/settings/sessions$`));
  const current = page.getByTestId('sessions').locator('li[data-current]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText(m(locale, 'settings.sessions.thisDevice'));
});

test('second_device_is_revoked_from_the_first_and_rejected_next_request', async ({ page, browser }, info) => {
  test.skip(!['fr-desktop', 'ar-mobile'].includes(info.project.name), 'two projects cover it');
  const locale = localeOf(info);
  const email = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, email);
  await completeOnboarding(page.request, locale);

  const other = await otherDevice(browser, info);
  await apiLogin(other.page.request, email);
  await gotoHydrated(other.page, `/${locale}/settings/profile`);
  await expect(other.page).toHaveURL(new RegExp('/settings/profile$'));

  await gotoHydrated(page, `/${locale}/settings/sessions`);
  const revoke = page.getByRole('button', { name: new RegExp(m(locale, 'settings.sessions.revoke')) });
  await expect(revoke).toHaveCount(1);
  await revoke.click();
  await expect(page.getByRole('status').filter({ hasText: m(locale, 'settings.sessions.revokedTitle') })).toBeFocused();
  await expect(revoke).toHaveCount(0);

  expect((await other.page.request.get('/api/v1/me')).status()).toBe(401);
  await other.page.reload();
  await expect(other.page).toHaveURL(new RegExp(`/${locale}/login$`));
  expect((await page.request.get('/api/v1/me')).status(), 'first device still signed in').toBe(200);
  await other.context.close();
});

test('logout_and_logout_everywhere_with_confirmation_dialog', async ({ page, browser }, info) => {
  test.skip(!['fr-desktop', 'en-desktop', 'ar-mobile'].includes(info.project.name), 'subset');
  const locale = localeOf(info);
  const email = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, email);
  await completeOnboarding(page.request, locale);
  const other = await otherDevice(browser, info);
  await apiLogin(other.page.request, email);

  await gotoHydrated(page, `/${locale}/settings/sessions`);
  await page.getByRole('button', { name: m(locale, 'settings.sessions.logoutAll') }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(m(locale, 'settings.sessions.confirmText'));
  await expect(dialog.getByRole('button', { name: m(locale, 'common.cancel') })).toBeFocused();
  await expectNoAxeViolations(page, 'sessions (logout-all dialog)');
  await dialog.getByRole('button', { name: m(locale, 'settings.sessions.logoutAll') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
  expect((await other.page.request.get('/api/v1/me')).status(), 'other device signed out too').toBe(401);
  await other.context.close();

  // Plain logout from the profile.
  await apiLogin(page.request, email);
  await gotoHydrated(page, `/${locale}/settings/profile`);
  await page.getByRole('button', { name: m(locale, 'settings.profile.logout') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await gotoHydrated(page, `/${locale}/settings/sessions`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
});

test('forgot_and_reset_password_signs_out_every_session', async ({ page, browser }, info) => {
  test.skip(!['fr-desktop', 'en-desktop', 'ar-desktop', 'ar-mobile'].includes(info.project.name), 'subset');
  const locale = localeOf(info);
  const email = await verifiedAccount(page.request, locale);
  const other = await otherDevice(browser, info);
  await apiLogin(other.page.request, email);

  await gotoHydrated(page, `/${locale}/forgot-password`);
  await expectNoAxeViolations(page, 'forgot-password');
  await page.getByLabel(m(locale, 'common.email')).fill(email);
  await page.getByRole('button', { name: m(locale, 'auth.forgot.submit') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m(locale, 'auth.forgot.sentTitle'));
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByText(m(locale, 'auth.forgot.sentText'))).toBeVisible();

  await gotoHydrated(page, await latestMailLink(email, 'reset-password'));
  expect(page.url()).not.toContain('token');
  await expectNoAxeViolations(page, 'reset-password (form)');
  const newPassword = 'another long phrase 2027';
  await page.getByLabel(m(locale, 'auth.password.new')).fill(newPassword);
  await page.getByLabel(m(locale, 'auth.password.confirm')).fill(newPassword);
  await page.getByRole('button', { name: m(locale, 'auth.reset.submit') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m(locale, 'auth.reset.successTitle'));
  await expect(page.getByText(m(locale, 'auth.reset.allSessionsTitle'))).toBeVisible();

  expect((await other.page.request.get('/api/v1/me')).status(), 'existing session ended').toBe(401);
  const old = await page.request.post('/api/v1/auth/login', { headers: API, data: { email, password: PASSWORD } });
  expect(old.status(), 'old password refused').toBe(401);
  await apiLogin(page.request, email, newPassword);
  await other.context.close();

  // A reused link shows the "no longer valid" screen.
  await gotoHydrated(page, await latestMailLink(email, 'reset-password'));
  await page.getByLabel(m(locale, 'auth.password.new')).fill(newPassword + 'x');
  await page.getByLabel(m(locale, 'auth.password.confirm')).fill(newPassword + 'x');
  await page.getByRole('button', { name: m(locale, 'auth.reset.submit') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m(locale, 'auth.reset.invalidTitle'));
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expectNoAxeViolations(page, 'reset-password (invalid link)');
});

test('wrong_password_shows_the_generic_error_and_moves_focus_to_it', async ({ page, request }, info) => {
  const locale = localeOf(info);
  const email = await verifiedAccount(request, locale);
  await gotoHydrated(page, `/${locale}/login`);
  await page.getByLabel(m(locale, 'common.email')).fill(email);
  await page.getByLabel(m(locale, 'common.password'), { exact: true }).fill('not the right password');
  await page.getByRole('button', { name: m(locale, 'auth.login.submit') }).click();
  const alert = page.getByRole('alert').filter({ hasText: m(locale, 'auth.login.invalidTitle') });
  await expect(alert).toBeFocused();
  await expect(alert).toContainText(m(locale, 'auth.login.invalidText'));
  // Same message for an unknown address (no enumeration).
  await page.getByLabel(m(locale, 'common.email')).fill(uniqueEmail('nobody'));
  await page.getByLabel(m(locale, 'common.password'), { exact: true }).fill('not the right password');
  await page.getByRole('button', { name: m(locale, 'auth.login.submit') }).click();
  await expect(page.getByRole('alert').filter({ hasText: m(locale, 'auth.login.invalidTitle') })).toBeVisible();
  await expectNoAxeViolations(page, 'login (error)');
});

test('empty_submit_focuses_the_first_invalid_field', async ({ page }, info) => {
  const locale = localeOf(info);
  await gotoHydrated(page, `/${locale}/login`);
  await page.getByRole('button', { name: m(locale, 'auth.login.submit') }).click();
  const emailField = page.getByLabel(m(locale, 'common.email'));
  await expect(emailField).toBeFocused();
  await expect(emailField).toHaveAttribute('aria-invalid', 'true');

  await gotoHydrated(page, `/${locale}/register`);
  await page.getByLabel(m(locale, 'common.email')).fill(uniqueEmail('x'));
  await page.getByLabel(m(locale, 'common.password'), { exact: true }).fill(PASSWORD);
  await page.getByLabel(m(locale, 'auth.password.confirm')).fill('something else entirely');
  await page.getByRole('button', { name: m(locale, 'auth.register.submit') }).click();
  await expect(page.getByLabel(m(locale, 'auth.password.confirm'))).toBeFocused();
  await expect(page.getByText(m(locale, 'auth.password.mismatch'))).toBeVisible();
  await expect(page.getByText(m(locale, 'auth.register.termsRequired'))).toBeVisible();
  await expectNoAxeViolations(page, 'register (errors)');
});

test('rate_limited_login_shows_the_wait_and_blocks_the_button', async ({ page, request }, info) => {
  test.skip(!['fr-desktop', 'ar-mobile'].includes(info.project.name), 'subset');
  const locale = localeOf(info);
  const email = uniqueEmail('limited');
  // 10 attempts per 15 min for one address from one client: spend them through the API (same client address).
  for (let i = 0; i < 10; i++)
    await request.post('/api/v1/auth/login', { headers: API, data: { email, password: 'wrong password here' } });
  await gotoHydrated(page, `/${locale}/login`);
  await page.getByLabel(m(locale, 'common.email')).fill(email);
  await page.getByLabel(m(locale, 'common.password'), { exact: true }).fill('wrong password here');
  await page.getByRole('button', { name: m(locale, 'auth.login.submit') }).click();
  const alert = page.getByRole('alert').filter({ hasText: m(locale, 'auth.login.limitedText') });
  await expect(alert).toBeFocused();
  await expect(alert).toContainText(/\d+/);
  await expect(page.locator('form button[type="submit"]')).toHaveAttribute('aria-disabled', 'true');
  await expectNoAxeViolations(page, 'login (rate limited)');
});

test('keyboard_only_registration_and_login', async ({ page }, info) => {
  test.skip(isMobile(info), 'physical keyboard on desktop projects');
  const locale = localeOf(info);
  const email = uniqueEmail('kbd');
  await gotoHydrated(page, `/${locale}/register`);
  await page.locator('h1').click();
  await tabTo(page, page.getByLabel(m(locale, 'common.email')));
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Tab'); // show/hide toggle
  await page.keyboard.press('Space');
  await expect(page.getByLabel(m(locale, 'common.password'), { exact: true })).toHaveAttribute('type', 'text');
  await tabTo(page, page.getByLabel(m(locale, 'auth.password.confirm')));
  await page.keyboard.type(PASSWORD);
  await tabTo(page, page.getByLabel(m(locale, 'auth.register.terms')));
  await page.keyboard.press('Space');
  await tabTo(page, page.getByRole('button', { name: m(locale, 'auth.register.submit') }));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${locale}/verify-email$`));

  await gotoHydrated(page, await latestMailLink(email, 'verify-email'));
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: m(locale, 'auth.verify.continue') })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${locale}/login$`));
  await page.waitForSelector('html[data-hydrated="true"]', { state: 'attached' });
  await page.locator('h1').click();
  await tabTo(page, page.getByLabel(m(locale, 'common.email')));
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${locale}/onboarding`));
});

test('idor_sessions_and_preferences_are_scoped_to_their_owner', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'fr-desktop', 'API-level check, once');
  const locale = localeOf(info);
  const a = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, a);
  await completeOnboarding(page.request, locale, 'Lyon');
  const aSession = (await (await page.request.get('/api/v1/me/sessions')).json()).items[0].id as string;

  const b = await otherDevice(browser, info);
  const bEmail = await verifiedAccount(b.page.request, locale);
  await apiLogin(b.page.request, bEmail);
  await completeOnboarding(b.page.request, locale, 'Paris');

  expect((await b.page.request.delete(`/api/v1/me/sessions/${aSession}`, { headers: API })).status(), 'B cannot revoke A').toBe(404);
  expect((await page.request.get('/api/v1/me')).status(), 'A still signed in').toBe(200);
  const bSessions = (await (await b.page.request.get('/api/v1/me/sessions')).json()).items.map((s: { id: string }) => s.id);
  expect(bSessions).not.toContain(aSession);

  const bPrefs = await b.page.request.get('/api/v1/me/preferences');
  expect((await bPrefs.json()).cityName).toBe('Paris');
  const patch = await b.page.request.patch('/api/v1/me/preferences', {
    headers: { ...API, 'If-Match': bPrefs.headers().etag! },
    data: { cityName: 'Marseille' },
  });
  expect(patch.status()).toBe(200);
  expect((await (await page.request.get('/api/v1/me/preferences')).json()).cityName, "A's city untouched").toBe('Lyon');

  // Through the UI too: B's sessions page lists only B's session.
  await gotoHydrated(b.page, `/${locale}/settings/sessions`);
  await expect(b.page.getByTestId('sessions').locator('li')).toHaveCount(1);
  await b.context.close();
});

test('profile_conflict_409_shows_reload_message', async ({ page }, info) => {
  test.skip(!['fr-desktop', 'ar-desktop'].includes(info.project.name), 'subset');
  const locale = localeOf(info);
  const email = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, email);
  await completeOnboarding(page.request, locale);
  await gotoHydrated(page, `/${locale}/settings/profile`);
  // Another tab changes the preferences meanwhile.
  const now = await page.request.get('/api/v1/me/preferences');
  await page.request.patch('/api/v1/me/preferences', { headers: { ...API, 'If-Match': now.headers().etag! }, data: { learningEnabled: true } });
  await page.getByRole('radio', { name: m(locale, 'settings.profile.WARM') }).check();
  await page.getByRole('button', { name: m(locale, 'settings.profile.save') }).click();
  const alert = page.getByRole('alert').filter({ hasText: m(locale, 'settings.profile.conflictTitle') });
  await expect(alert).toBeFocused();
  await expect(alert.getByRole('button', { name: m(locale, 'settings.profile.reload') })).toBeVisible();
});

test('export_request_and_account_deletion_with_password_reauth', async ({ page }, info) => {
  test.skip(!['fr-desktop', 'en-desktop', 'ar-mobile'].includes(info.project.name), 'subset');
  const locale = localeOf(info);
  const email = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, email);
  await completeOnboarding(page.request, locale);
  await gotoHydrated(page, `/${locale}/settings/profile`);

  await page.getByRole('button', { name: m(locale, 'settings.profile.export') }).click();
  await expect(page.getByText(m(locale, 'settings.profile.exportDone'))).toBeVisible();

  await page.getByRole('button', { name: m(locale, 'settings.profile.delete') }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(m(locale, 'settings.profile.deleteConfirmText'));
  await expectNoAxeViolations(page, 'profile (deletion dialog)');
  const pw = dialog.getByLabel(m(locale, 'common.password'), { exact: true });
  await expect(pw).toHaveAttribute('autocomplete', 'current-password');
  await pw.fill('not my password at all');
  await dialog.getByRole('button', { name: m(locale, 'settings.profile.deleteConfirm') }).click();
  await expect(dialog.getByText(m(locale, 'settings.profile.wrongPassword'))).toBeVisible();
  await expect(pw).toBeFocused();
  await pw.fill(PASSWORD);
  await dialog.getByRole('button', { name: m(locale, 'settings.profile.deleteConfirm') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(m(locale, 'settings.profile.deletedTitle'));
  await expect(page.getByText(m(locale, 'settings.profile.deletedText'))).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
});

test('every_identity_page_passes_axe_reflows_and_has_lang_dir_and_title', async ({ page, request }, info) => {
  const locale = localeOf(info);
  const pages: [string, string][] = [
    [`/${locale}/login`, 'auth.login.title'],
    [`/${locale}/register`, 'auth.register.title'],
    [`/${locale}/verify-email`, 'auth.verify.title'],
    [`/${locale}/forgot-password`, 'auth.forgot.title'],
    [`/${locale}/reset-password`, 'auth.reset.title'],
  ];
  const email = await verifiedAccount(request, locale);
  await apiLogin(page.request, email);
  pages.push([`/${locale}/onboarding`, 'onboarding.title']);
  for (const [url, titleKey] of pages) {
    await gotoHydrated(page, url);
    await expectLangDir(page, locale);
    await expect(page).toHaveTitle(new RegExp(m(locale, titleKey)));
    await expectNoAxeViolations(page, url);
    if (isMobile(info)) await expectNoHorizontalScroll(page);
    await page.setViewportSize(info.project.use.viewport!);
  }
  // Onboarding step 2, then the two settings pages once onboarded.
  await page.getByRole('button', { name: m(locale, 'onboarding.continue') }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.getByRole('button', { name: m(locale, 'onboarding.finish') }).click();
  await expect(page.getByLabel(m(locale, 'onboarding.search'))).toBeFocused();
  await expectNoAxeViolations(page, 'onboarding step 2 (error)');
  if (isMobile(info)) await expectNoHorizontalScroll(page);
  await completeOnboarding(page.request, locale);
  for (const [url, titleKey] of [
    [`/${locale}/settings/profile`, 'settings.profile.title'],
    [`/${locale}/settings/sessions`, 'settings.sessions.title'],
  ] as const) {
    await page.setViewportSize(info.project.use.viewport!);
    await gotoHydrated(page, url);
    await expectLangDir(page, locale);
    await expect(page).toHaveTitle(new RegExp(m(locale, titleKey)));
    await expectNoAxeViolations(page, url);
    if (isMobile(info)) await expectNoHorizontalScroll(page);
  }
});

test('onboarding_gps_denied_never_blocks_and_manual_city_works', async ({ page, context }, info) => {
  test.skip(!['fr-mobile', 'ar-mobile'].includes(info.project.name), 'mobile only');
  const locale = localeOf(info);
  await context.clearPermissions(); // geolocation not granted => the browser denies
  const email = await verifiedAccount(page.request, locale);
  await apiLogin(page.request, email);
  await gotoHydrated(page, `/${locale}/onboarding?step=city`);
  await page.getByRole('button', { name: m(locale, 'onboarding.gps') }).click();
  await expect(page.getByText(m(locale, 'onboarding.gpsDeniedTitle'))).toBeVisible();
  await page.getByLabel(m(locale, 'onboarding.search')).fill('Tizi');
  await expect(page.getByText(m(locale, 'onboarding.noResults').split('{')[0]!.trim())).toBeVisible();
  await page.getByLabel(m(locale, 'onboarding.manualCity'), { exact: true }).fill('Tizi Ouzou');
  await page.getByLabel(m(locale, 'onboarding.timezone')).selectOption('Africa/Algiers');
  await page.getByRole('button', { name: m(locale, 'onboarding.finish') }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/settings/profile$`));
  expect(await (await page.request.get('/api/v1/me/preferences')).json()).toMatchObject({ cityName: 'Tizi Ouzou', timezone: 'Africa/Algiers' });
});
