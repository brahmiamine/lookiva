// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../setup/dom-polyfills';
import type { Catalog } from '@/app/[locale]/(app)/dressing/types';
import { addDays, groupByDay, missingRoles, scheduleBody, weekOf, zonedInstant, type Outfit, type WearRecord } from '@/app/[locale]/(app)/tenues/logic';
import { OutfitEditor } from '@/app/[locale]/(app)/tenues/OutfitEditor';
import { Outfits } from '@/app/[locale]/(app)/tenues/Outfits';
import { WashPanel } from '@/app/[locale]/(app)/tenues/WashPanel';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/fr/tenues' }));

const fr = (k: string) => getMessage('fr', k);
const wrap = (ui: React.ReactNode) => render(<IntlProvider locale="fr" messages={pickMessages('fr', ['common', 'outfits', 'wardrobe'])}>{ui}</IntlProvider>);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const catalog: Catalog = {
  categories: [{ code: 'TOPS', label: 'Hauts', subtypes: [{ code: 'TSHIRT', label: 'T-shirt' }] }],
  colors: [{ code: 'BLACK', label: 'Noir', hex: '#000000' }], seasons: [], styles: [], statuses: ['AVAILABLE', 'TO_WASH'],
  weather: { warmth: [], rain: [], windproof: [], breathability: [], layering: [] }, customs: [],
};
const G = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const garment = (id: string, nickname: string, status = 'AVAILABLE') => ({
  id, nickname, categoryCode: 'TOPS', subtypeCode: 'TSHIRT', customSubcategory: null, primaryColor: { code: 'BLACK', shade: null }, extraColors: [], seasons: [], styles: [],
  status, version: 1,
});
const outfit = (id: string, over: Partial<Outfit> = {}): Outfit => ({
  id, title: null, status: 'PLANNED', occasion: 'Travail', startsAt: null, endsAt: null, localDate: '2026-10-29', localTime: '09:00', timezone: 'Europe/Paris',
  items: [], activeWearRecordId: null, version: 1, ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/fr/tenues');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const calls = () => fetchMock.mock.calls.map((c) => ({ url: String(c[0]), init: c[1] as RequestInit }));

describe('outfits logic', () => {
  it('week_runs_monday_to_sunday_and_zoned_instants_follow_dst', () => {
    expect(weekOf('2026-10-29')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(zonedInstant('2026-07-01', '09:00', 'Europe/Paris')).toBe('2026-07-01T07:00:00.000Z'); // UTC+2
    expect(zonedInstant('2026-12-01', '09:00', 'Europe/Paris')).toBe('2026-12-01T08:00:00.000Z'); // UTC+1
    expect(zonedInstant('2026-10-29', '23:30', 'Asia/Tokyo')).toBe('2026-10-29T14:30:00.000Z');
  });

  it('schedule_body_clears_empty_fields_and_an_end_before_the_start_is_the_next_day', () => {
    expect(scheduleBody({ title: ' ', occasion: '', date: '', start: '', end: '', timezone: 'UTC' })).toEqual({ title: null, occasion: null, startsAt: null, endsAt: null, timezone: null });
    expect(scheduleBody({ title: 'Soirée', occasion: 'Dîner', date: '2026-10-29', start: '22:00', end: '01:00', timezone: 'UTC' })).toMatchObject({
      startsAt: '2026-10-29T22:00:00.000Z', endsAt: '2026-10-30T01:00:00.000Z', timezone: 'UTC',
    });
  });

  it('several_outfits_of_one_day_are_grouped_and_sorted_by_start', () => {
    const a = outfit('a', { startsAt: '2026-10-29T18:00:00Z' });
    const b = outfit('b', { startsAt: '2026-10-29T08:00:00Z' });
    const c = outfit('c', { startsAt: '2026-10-29T12:00:00Z' });
    const d = outfit('d', { localDate: '2026-10-30', startsAt: '2026-10-30T08:00:00Z' });
    const g = groupByDay([a, b, c, d], ['2026-10-29', '2026-10-30', '2026-10-31']);
    expect(g.map((x) => x.outfits.map((o) => o.id))).toEqual([['b', 'c', 'a'], ['d'], []]);
    expect(missingRoles(['TOP'])).toEqual(['BOTTOM', 'SHOES']);
    expect(missingRoles(['ONE_PIECE', 'SHOES'])).toEqual([]);
  });
});

describe('day and week views', () => {
  it('day_view_lists_three_outfits_of_the_same_day_in_order_with_status_and_missing_role_chips', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('from=')) return json({ items: [
        outfit('o3', { title: 'Soir', startsAt: '2026-10-29T18:00:00Z', localTime: '19:00', status: 'DRAFT' }),
        outfit('o1', { title: 'Matin', startsAt: '2026-10-29T07:00:00Z', localTime: '08:00' }),
        outfit('o2', { title: 'Midi', startsAt: '2026-10-29T11:00:00Z', localTime: '12:00', status: 'WORN' }),
      ], truncated: false });
      if (url.includes('conflicts')) return json({ outfitId: 'x', conflicts: [] });
      return json({ items: [] });
    });
    wrap(<Outfits timezone="Europe/Paris" initialView="day" initialDate="2026-10-29" />);
    const links = await screen.findAllByRole('link', { name: /Matin|Midi|Soir/ });
    expect(links.map((l) => within(l).getByText(/Matin|Midi|Soir/).textContent)).toEqual(['Matin', 'Midi', 'Soir']);
    expect((links[0])?.textContent).toContain(fr('outfits.status.PLANNED'));
    expect((links[1])?.textContent).toContain(fr('outfits.status.WORN'));
    expect((links[2])?.textContent).toContain(fr('outfits.status.DRAFT'));
    // advisory chips are separate from the status and absent from worn outfits
    expect((within(links[0]!).getByRole('list', { name: fr('outfits.warnings.label') }))?.textContent).toContain('Haut');
    expect(within(links[1]!).queryByRole('list', { name: fr('outfits.warnings.label') })).toBeNull();
    expect(calls()[0]!.url).toContain('/outfits?from=2026-10-29&to=2026-10-29');
  });

  it('week_view_requests_seven_days_and_shows_each_day', async () => {
    fetchMock.mockImplementation(async (url: string) => json(url.includes('from=') ? { items: [outfit('o1', { title: 'Jeudi', localDate: '2026-10-29' })], truncated: false } : { items: [], outfitId: 'x', conflicts: [] }));
    wrap(<Outfits timezone="Europe/Paris" initialView="week" initialDate="2026-10-29" />);
    const week = await screen.findByTestId('week');
    expect(week.querySelectorAll(':scope > li')).toHaveLength(7);
    expect(within(week.querySelector('[data-date="2026-10-29"]') as HTMLElement).getByText('Jeudi')).toBeTruthy();
    expect(within(week.querySelector('[data-date="2026-10-30"]') as HTMLElement).getByText(fr('outfits.nothingPlanned'))).toBeTruthy();
    expect(calls()[0]!.url).toContain('from=2026-10-26&to=2026-11-01');
  });
});

const record: WearRecord = {
  id: 'r1', outfitId: 'o1', title: null, occasion: null, status: 'ACTIVE', confirmedAt: '2026-10-29T08:00:00Z', localDate: '2026-10-29', localTime: '09:00', timezone: 'Europe/Paris',
  items: [], version: 1,
};
const lines = [1, 2, 3, 4].map((n) => ({ garmentId: G(n), name: `Pièce ${n}`, status: 'AVAILABLE' }));

describe('wash panel', () => {
  const setup = () => {
    const onClose = vi.fn();
    const onDone = vi.fn();
    wrap(<WashPanel open record={record} lines={lines} onClose={onClose} onDone={onDone} onUnauthorized={vi.fn()} />);
    return { onClose, onDone, dialog: screen.getByRole('dialog') };
  };

  it('every_box_starts_unchecked_in_a_labelled_group_with_current_statuses', () => {
    const { dialog } = setup();
    const group = within(dialog).getByRole('group', { name: fr('outfits.wash.legend') });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    boxes.forEach((b) => expect(((b) as HTMLInputElement).checked).toBe(false));
    expect(within(group).getAllByText(fr('wardrobe.status.AVAILABLE'))).toHaveLength(4);
  });

  it('skip_sends_nothing', async () => {
    const { onClose, dialog } = setup();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Pièce 1/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: fr('outfits.wash.skip') }));
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only_the_checked_subset_is_sent_with_an_idempotency_key_and_results_are_per_garment', async () => {
    fetchMock.mockResolvedValue(json({ wearRecordId: 'r1', marked: [G(1)], skipped: [{ garmentId: G(3), status: 'LENT', reason: 'NOT_AVAILABLE' }], failed: [] }));
    const { onDone, dialog } = setup();
    const mark = within(dialog).getByRole('button', { name: /À laver|lavage|sélection/ });
    await userEvent.click(mark);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing checked: nothing sent
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Pièce 1/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Pièce 3/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /2 vêtements/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const { url, init } = calls()[0]!;
    expect(url).toBe('/api/v1/wear-records/r1/mark-to-wash');
    expect(JSON.parse(String(init.body))).toEqual({ garmentIds: [G(1), G(3)] });
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
    const results = await screen.findByTestId('wash-results');
    expect((results)?.textContent).toContain('Pièce 1');
    expect((results)?.textContent).toContain(fr('wardrobe.status.LENT'));
    expect(screen.getByText(fr('outfits.wash.partialText'))).toBeTruthy();
  });

  it('a_failed_request_never_shows_a_success', async () => {
    fetchMock.mockResolvedValue(json({ code: 'INTERNAL' }, 500));
    const { onDone, dialog } = setup();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Pièce 2/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /1 vêtement/ }));
    expect((await within(dialog).findByRole('alert'))?.textContent).toContain(fr('outfits.wash.errorTitle'));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByTestId('wash-results')).toBeNull();
    expect(((within(dialog).getByRole('checkbox', { name: /Pièce 2/ })) as HTMLInputElement).checked).toBe(true); // can retry
  });
});

describe('outfit editor', () => {
  const o = outfit('11111111-1111-4111-8111-111111111111', {
    title: 'Bureau', items: [{ garmentId: G(1), role: 'TOP', position: 0 }, { garmentId: G(2), role: 'BOTTOM', position: 1 }], version: 4,
    warnings: [{ code: 'MISSING_ROLE', role: 'SHOES' }, { code: 'GARMENT_UNAVAILABLE', garmentId: G(2), status: 'TO_WASH' }],
  });
  const routes = (extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined) =>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const r = extra(url, init);
      if (r) return r;
      if (url.endsWith('/conflicts')) return json({ outfitId: o.id, conflicts: [
        { kind: 'GARMENT_UNAVAILABLE', garmentId: G(2), status: 'TO_WASH', suggestions: [G(5)] },
        { kind: 'OVERLAP_POSSIBLE', garmentId: G(1), otherOutfitId: '22222222-2222-4222-8222-222222222222', suggestions: [] },
      ] });
      const id = /garments\/([0-9a-f-]{36})$/.exec(url)?.[1];
      if (id) return json(garment(id, { [G(1)]: 'Chemise', [G(2)]: 'Jean', [G(5)]: 'Chino' }[id]!, id === G(2) ? 'TO_WASH' : 'AVAILABLE'));
      return json({}, 404);
    });

  it('warnings_and_conflicts_are_shown_apart_from_the_status_and_one_click_replace_sends_put_with_if_match', async () => {
    routes((url, init) => (init?.method === 'PUT' ? json({ ...o, version: 5, items: [o.items[0], { ...o.items[1]!, garmentId: G(5) }], warnings: [] }) : undefined));
    wrap(<OutfitEditor catalog={catalog} initial={o} timezone="Europe/Paris" zones={['Europe/Paris']} />);
    const chips = screen.getByRole('list', { name: fr('outfits.warnings.label') });
    expect((chips)?.textContent).toContain('Chaussures');
    const conflicts = await screen.findByTestId('conflicts');
    await waitFor(() => expect((conflicts)?.textContent).toContain('Jean n’est pas disponible'));
    expect((conflicts)?.textContent).toContain('Chemise est aussi prévu dans une autre tenue ce jour-là');
    expect((within(conflicts).getByRole('link', { name: fr('outfits.editor.conflicts.seeOther') })).getAttribute('href')).toBe('/fr/tenues/22222222-2222-4222-8222-222222222222');
    await userEvent.click(await within(conflicts).findByRole('button', { name: 'Remplacer par Chino' }));
    await waitFor(() => expect(calls().some((c) => c.init?.method === 'PUT')).toBe(true));
    const put = calls().find((c) => c.init?.method === 'PUT')!;
    expect(put.url).toBe(`/api/v1/outfits/${o.id}/items/${G(2)}`);
    expect(JSON.parse(String(put.init.body))).toEqual({ garmentId: G(5) });
    expect(new Headers(put.init.headers).get('If-Match')).toBe('W/"v4"');
    expect(await screen.findByText(fr('outfits.editor.conflicts.replaced'))).toBeTruthy();
  });

  it('confirm_worn_failure_never_opens_the_wash_panel_and_already_worn_is_explained', async () => {
    routes((url, init) => (url.endsWith('/confirm-worn') ? json({ code: 'ALREADY_WORN' }, 409) : init?.method === undefined && url.endsWith(o.id) ? json({ ...o, status: 'WORN' }) : undefined));
    wrap(<OutfitEditor catalog={catalog} initial={o} timezone="Europe/Paris" zones={['Europe/Paris']} />);
    await userEvent.click(screen.getByRole('button', { name: fr('outfits.editor.markWorn') }));
    expect(await screen.findByText(fr('outfits.editor.alreadyWorn'))).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const confirm = calls().find((c) => c.url.endsWith('/confirm-worn'))!;
    expect(new Headers(confirm.init.headers).get('Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(confirm.init.body))).toMatchObject({ expectedVersion: 4 });
  });

  it('confirm_worn_success_opens_the_optional_panel_with_nothing_checked', async () => {
    const rec = { ...record, outfitId: o.id, items: [{ garmentId: G(1), role: 'TOP', position: 0, snapshot: { nickname: 'Chemise', categoryCode: 'TOPS', subtypeCode: 'TSHIRT', customSubtypeLabel: null, primaryColorCode: 'BLACK', extraColorCodes: [] } }] };
    routes((url) => (url.endsWith('/confirm-worn') ? json({ outfit: { ...o, status: 'WORN', activeWearRecordId: 'r1', version: 5 }, wearRecord: rec }, 201) : undefined));
    wrap(<OutfitEditor catalog={catalog} initial={o} timezone="Europe/Paris" zones={['Europe/Paris']} />);
    await userEvent.click(screen.getByRole('button', { name: fr('outfits.editor.markWorn') }));
    const dialog = await screen.findByRole('dialog', { name: fr('outfits.wash.title') });
    expect(((within(dialog).getByRole('checkbox', { name: /Chemise/ })) as HTMLInputElement).checked).toBe(false);
    expect(calls().some((c) => c.url.includes('mark-to-wash'))).toBe(false);
  });
});
