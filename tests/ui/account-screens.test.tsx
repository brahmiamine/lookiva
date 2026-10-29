// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../setup/dom-polyfills';
import { Profile } from '@/app/[locale]/(app)/settings/profile/Profile';
import { Sessions, type SessionItem } from '@/app/[locale]/(app)/settings/sessions/Sessions';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const fr = (k: string) => getMessage('fr', k);
const wrap = (ui: React.ReactNode) =>
  render(
    <IntlProvider locale="fr" messages={pickMessages('fr', ['common', 'settings'])}>
      {ui}
    </IntlProvider>,
  );
const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ code, status }), { status, headers: { 'Content-Type': 'application/problem+json', ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const session = (id: string, current = false): SessionItem => ({
  id,
  userAgent: 'Firefox on Windows',
  createdAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  current,
});

describe('Sessions revoke (F1)', () => {
  it('a_404_means_already_revoked_and_shows_success_not_an_error', async () => {
    fetchMock.mockResolvedValue(problem(404, 'NOT_FOUND'));
    wrap(<Sessions initial={[session('a', true), session('b')]} />);
    await userEvent.click(screen.getByRole('button', { name: /Révoquer/ }));
    await screen.findByText(fr('settings.sessions.revokedTitle'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Révoquer/ })).toBeNull();
  });

  it('a_double_click_sends_one_request', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)));
    wrap(<Sessions initial={[session('a', true), session('b')]} />);
    const btn = screen.getByRole('button', { name: /Révoquer/ });
    await userEvent.click(btn);
    await userEvent.click(btn);
    release(new Response(null, { status: 204 }));
    await screen.findByText(fr('settings.sessions.revokedTitle'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const prefs = {
  locale: 'fr' as const,
  cityName: 'Lyon',
  countryCode: 'FR',
  latitude: 45.76,
  longitude: 4.84,
  timezone: 'Europe/Paris',
  aiEnabled: false,
  learningEnabled: false,
  thermalSensitivity: 'NEUTRAL' as const,
  onboardingCompletedAt: new Date().toISOString(),
  version: 1,
};
const openDeletion = async (password: string) => {
  wrap(<Profile initial={prefs} etag='W/"v1"' timeZones={['Europe/Paris']} pendingExportAt={null} />);
  await userEvent.click(screen.getByRole('button', { name: fr('settings.profile.delete') }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(screen.getByLabelText(fr('common.password'), { selector: 'input' }), password);
  await userEvent.click(screen.getByRole('button', { name: fr('settings.profile.deleteConfirm') }));
  return dialog;
};

describe('Profile deletion errors (F4)', () => {
  it('a_401_redirects_to_login', async () => {
    fetchMock.mockResolvedValue(problem(401, 'UNAUTHENTICATED'));
    await openDeletion('whatever password');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/fr/login'));
  });

  it('a_429_is_a_form_notice_not_a_password_error', async () => {
    fetchMock.mockResolvedValue(problem(429, 'RATE_LIMITED', { 'Retry-After': '600' }));
    const dialog = await openDeletion('whatever password');
    const alert = await screen.findByText(getMessage('fr', 'common.rateLimitedTitle').replace('{minutes}', '10'));
    expect(dialog.contains(alert)).toBe(true);
    expect(screen.getByLabelText(fr('common.password'), { selector: 'input' }).getAttribute('aria-invalid')).toBeNull();
  });

  it('a_wrong_password_is_on_the_password_field', async () => {
    fetchMock.mockResolvedValue(problem(401, 'INVALID_CREDENTIALS'));
    await openDeletion('wrong password');
    await screen.findByText(fr('settings.profile.wrongPassword'));
    expect(screen.getByLabelText(fr('common.password'), { selector: 'input' }).getAttribute('aria-invalid')).toBe('true');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Profile city (F2)', () => {
  it('an_empty_city_is_not_sent_and_the_field_is_flagged', async () => {
    wrap(<Profile initial={prefs} etag='W/"v1"' timeZones={['Europe/Paris']} pendingExportAt={null} />);
    const city = screen.getByLabelText(fr('settings.profile.city'));
    await userEvent.clear(city);
    await userEvent.click(screen.getByRole('button', { name: fr('settings.profile.save') }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(city.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(city);
  });
});
