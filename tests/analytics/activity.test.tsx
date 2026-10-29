// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Activity } from '@/app/[locale]/(app)/activity/Activity';
import { IntlProvider } from '@/ui/components/IntlProvider';
import { pickMessages } from '@/i18n/messages';
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('renders reminders without requesting browser permissions and removes a dismissed item', async () => {
    const fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => Promise.resolve(init.method === 'DELETE' ? new Response(null, { status: 204 }) : json(url.endsWith('preferences') ? { enabled: false, minutesBefore: 60 } : { items: [{ id: 'n', outfitId: 'o', startsAt: '2026-10-29T12:00:00Z', readAt: null }] })));
    vi.stubGlobal('fetch', fetch);
    render(<IntlProvider locale="fr" messages={pickMessages('fr', ['activity'])}><Activity today="2026-10-29"/></IntlProvider>);
    await screen.findByText('Une tenue planifiée approche.');
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await screen.findByText('Aucune notification.');
    expect(fetch.mock.calls.some(c => c[0].includes('/push'))).toBe(false);
});
it('calculates statistics using the chosen window and displays unknown costs honestly', async () => {
    const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(json(url.startsWith('/api/v1/analytics') ? { eligible: 1, used: 0, missingPrices: 1, spending: [], items: [{ id: 'g', name: 'Chemise', wears: 0, totalWears: 0, lastThree: [], forgotten: false, costPerWear: null, currency: null }] } : url.endsWith('preferences') ? { enabled: false, minutesBefore: 60 } : { items: [] })));
    vi.stubGlobal('fetch', fetch);
    render(<IntlProvider locale="fr" messages={pickMessages('fr', ['activity'])}><Activity today="2026-10-29"/></IntlProvider>);
    await screen.findByText('Aucune notification.');
    await userEvent.click(screen.getByRole('button', { name: 'Statistiques' }));
    await userEvent.click(screen.getByRole('button', { name: 'Calculer' }));
    await screen.findByText('Chemise');
    expect(await screen.findByText(/Non calculable/)).toBeTruthy();
    expect(fetch.mock.calls.find(c => c[0].startsWith('/api/v1/analytics'))?.[0]).toContain('forgottenDays=90');
});
