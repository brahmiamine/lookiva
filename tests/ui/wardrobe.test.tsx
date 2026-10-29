// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../setup/dom-polyfills';
import { GarmentForm } from '@/app/[locale]/(app)/dressing/GarmentForm';
import { PhotoManager } from '@/app/[locale]/(app)/dressing/PhotoManager';
import { Wardrobe } from '@/app/[locale]/(app)/dressing/Wardrobe';
import {
  bulkFailures, checkPhoto, daysLeft, emptyForm, filtersToQuery, limitKey, mapServerErrors, parseFilters, setFilter, toBody, uploadProblem, validateForm,
} from '@/app/[locale]/(app)/dressing/logic';
import type { Catalog, Garment } from '@/app/[locale]/(app)/dressing/types';
import { StatusPill } from '@/app/[locale]/(app)/dressing/ui';
import { getMessage, pickMessages } from '@/i18n/messages';
import { IntlProvider } from '@/ui/components/IntlProvider';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/fr/dressing' }));

const fr = (k: string) => getMessage('fr', k);
const wrap = (ui: React.ReactNode) => render(<IntlProvider locale="fr" messages={pickMessages('fr', ['common', 'wardrobe'])}>{ui}</IntlProvider>);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, code: string, errors?: { path: string; message: string }[]) =>
  new Response(JSON.stringify({ code, status, ...(errors ? { errors } : {}) }), { status, headers: { 'Content-Type': 'application/problem+json' } });

const STATUSES = ['AVAILABLE', 'TO_WASH', 'WASHING', 'DRYING', 'IN_REPAIR', 'LENT'];
const catalog: Catalog = {
  categories: [
    { code: 'TOPS', label: 'Hauts', subtypes: [{ code: 'TSHIRT', label: 'T-shirt' }, { code: 'SHIRT', label: 'Chemise' }] },
    { code: 'BOTTOMS', label: 'Bas', subtypes: [{ code: 'JEANS', label: 'Jean' }] },
  ],
  colors: [{ code: 'BLACK', label: 'Noir', hex: '#000000' }, { code: 'WHITE', label: 'Blanc', hex: '#FFFFFF' }],
  seasons: [{ code: 'SUMMER', label: 'Été' }],
  styles: [{ code: 'CASUAL', label: 'Décontracté' }],
  statuses: STATUSES,
  weather: { warmth: ['UNKNOWN', 'LIGHT'], rain: ['UNKNOWN', 'NONE'], windproof: ['UNKNOWN', 'YES', 'NO'], breathability: ['UNKNOWN', 'LOW'], layering: ['UNKNOWN', 'BASE'] },
  customs: [],
};
const garment = (id: string, nickname: string, version = 1): Garment => ({
  id, nickname, categoryCode: 'TOPS', subtypeCode: 'TSHIRT', customSubcategory: null, primaryColor: { code: 'BLACK', shade: null }, extraColors: [],
  seasons: [], styles: [], purchasePrice: null, purchaseCurrency: null, purchasedOn: null, purchaseStore: null, notes: null,
  warmth: 'UNKNOWN', rain: 'UNKNOWN', windproof: 'UNKNOWN', breathability: 'UNKNOWN', layering: 'UNKNOWN', status: 'AVAILABLE', version,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/fr/dressing');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe('wardrobe logic', () => {
  it('filters_round_trip_through_a_stable_query_and_a_new_category_drops_the_subtype', () => {
    const f = parseFilters('status=LENT&category=TOPS&subtype=TSHIRT&q=%20lin%20&junk=1');
    expect(f).toEqual({ status: 'LENT', category: 'TOPS', subtype: 'TSHIRT', q: 'lin' });
    expect(filtersToQuery(f)).toBe('q=lin&category=TOPS&subtype=TSHIRT&status=LENT');
    expect(setFilter(f, 'category', 'BOTTOMS')).not.toHaveProperty('subtype');
    expect(setFilter(f, 'status', '').status).toBeUndefined();
  });

  it('form_validation_requires_classification_and_color_and_a_currency_with_a_price', () => {
    expect(validateForm(emptyForm())).toEqual({ categoryCode: 'required', subtype: 'required', primaryColor: 'required' });
    const ok = { ...emptyForm(), categoryCode: 'TOPS', subtype: 'custom:abc', primaryColor: 'BLACK' };
    expect(validateForm({ ...ok, purchasePrice: '49,90' })).toEqual({ purchaseCurrency: 'currency' });
    expect(validateForm({ ...ok, purchasePrice: '4x' })).toMatchObject({ purchasePrice: 'price' });
    const body = toBody({ ...ok, purchasePrice: '49,90', purchaseCurrency: 'eur', nickname: '  ' });
    expect(body).toMatchObject({ subtypeCode: null, customSubcategoryId: 'abc', purchasePrice: 49.9, purchaseCurrency: 'EUR', nickname: null, warmth: 'UNKNOWN' });
  });

  it('server_field_errors_map_to_form_fields', () => {
    const r = mapServerErrors([
      { path: 'primaryColor.code', message: 'Invalid option' },
      { path: 'subtypeCode', message: 'SUBTYPE_NOT_IN_CATEGORY' },
      { path: 'weird', message: 'x' },
    ]);
    expect(r.fields).toEqual({ primaryColor: 'invalid', subtype: 'subtypeMismatch' });
    expect(r.unmapped).toHaveLength(1);
  });

  it('photo_checks_before_upload_and_server_answers', () => {
    const jpg = { name: 'a.jpg', type: 'image/jpeg', size: 1000 };
    expect(checkPhoto(jpg, 0)).toBeNull();
    expect(checkPhoto(jpg, 5)).toBe('limit');
    expect(checkPhoto({ ...jpg, size: 10 * 1024 * 1024 + 1 }, 0)).toBe('size');
    expect(checkPhoto({ name: 'IMG_1.HEIC', type: '', size: 10 }, 0)).toBe('heic');
    expect(checkPhoto({ name: 'a.gif', type: 'image/gif', size: 10 }, 0)).toBe('type');
    expect([uploadProblem(413, 'PAYLOAD_TOO_LARGE'), uploadProblem(415, 'UNSUPPORTED_MEDIA_TYPE'), uploadProblem(409, 'PHOTO_LIMIT_REACHED'), uploadProblem(422, 'X'), uploadProblem(500, 'X')]).toEqual(['size', 'heic', 'limit', 'damaged', 'generic']);
    expect([limitKey(429, 'RATE_LIMITED'), limitKey(409, 'QUOTA_EXCEEDED'), limitKey(409, 'GARMENT_LIMIT_REACHED'), limitKey(409, 'GROUP_LIMIT_REACHED'), limitKey(409, 'PHOTO_LIMIT_REACHED')]).toEqual(['rateLimited', 'quota', 'garments', 'groups', null]);
  });

  it('bulk_failures_and_days_left', () => {
    expect(bulkFailures(['a', 'b'], [{ path: 'ids.1', message: '' }, { path: 'expectedVersions.a', message: '' }])).toEqual(['b', 'a']);
    const now = Date.parse('2026-10-29T12:00:00Z');
    expect(daysLeft('2026-11-01T12:00:00Z', now)).toBe(3);
    expect(daysLeft('2026-10-29T13:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0);
  });
});

describe('status badges', () => {
  it('every_status_has_text_and_an_icon', () => {
    for (const s of STATUSES) {
      const { container } = wrap(<StatusPill status={s} />);
      expect(container.textContent).toBe(fr(`wardrobe.status.${s}`));
      expect(container.querySelector('svg')).not.toBeNull();
      cleanup();
    }
  });
});

describe('gallery', () => {
  it('filters_come_from_and_go_to_the_url', async () => {
    fetchMock.mockImplementation(async (u: string) => (String(u).includes('/photos') ? json({ items: [] }) : json({ items: [garment('11111111-1111-4111-8111-111111111111', 'Tee noir')] })));
    wrap(<Wardrobe catalog={catalog} initialQuery="category=TOPS&status=LENT" />);
    await screen.findByText('Tee noir');
    expect(urls()[0]).toBe('/api/v1/garments?limit=24&category=TOPS&status=LENT');
    expect(screen.getByRole('button', { name: 'Hauts' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Bas' }));
    await waitFor(() => expect(window.location.search).toBe('?category=BOTTOMS&status=LENT'));
    await waitFor(() => expect(urls()).toContain('/api/v1/garments?limit=24&category=BOTTOMS&status=LENT'));
    await userEvent.type(screen.getByLabelText(fr('wardrobe.filters.search')), 'lin');
    await waitFor(() => expect(window.location.search).toBe('?q=lin&category=BOTTOMS&status=LENT'), { timeout: 2000 });
  });

  it('shows_the_empty_and_error_states', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [] }));
    wrap(<Wardrobe catalog={catalog} initialQuery="" />);
    await screen.findByText(fr('wardrobe.emptyTitle'));
    cleanup();
    fetchMock.mockResolvedValueOnce(problem(500, 'INTERNAL_ERROR'));
    wrap(<Wardrobe catalog={catalog} initialQuery="" />);
    expect((await screen.findByRole('alert')).textContent).toContain(fr('wardrobe.loadErrorTitle'));
  });

  it('bulk_bar_sends_one_idempotent_request_and_names_the_garments_at_fault', async () => {
    const a = garment('11111111-1111-4111-8111-111111111111', 'Tee A', 3);
    const b = garment('22222222-2222-4222-8222-222222222222', 'Tee B', 7);
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) => {
      if (String(u).includes('/photos')) return json({ items: [] });
      if (String(u).includes('bulk-actions')) return problem(404, 'NOT_FOUND', [{ path: 'ids.1', message: 'gone' }]);
      void init;
      return json({ items: [a, b] });
    });
    wrap(<Wardrobe catalog={catalog} initialQuery="" />);
    await screen.findByText('Tee A');
    await userEvent.click(screen.getByRole('button', { name: fr('wardrobe.select.start') }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Tee A/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Tee B/ }));
    const bar = screen.getByRole('region', { name: fr('wardrobe.select.bar') });
    expect(bar.textContent).toContain('2 pièces sélectionnées');
    await userEvent.click(within(bar).getByRole('button', { name: fr('wardrobe.bulk.status') }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(fr('wardrobe.filters.status')), 'TO_WASH');
    await userEvent.click(within(dialog).getByRole('button', { name: /Appliquer/ }));
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('bulk-actions'))!;
    const init = call[1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(init.body))).toEqual({ action: 'SET_STATUS', ids: [a.id, b.id], expectedVersions: { [a.id]: 3, [b.id]: 7 }, params: { status: 'TO_WASH' } });
    const alert = await screen.findByText(fr('wardrobe.bulk.notFound'));
    expect(alert.closest('[role="alert"]')?.textContent).toContain('Tee B');
    expect(alert.closest('[role="alert"]')?.textContent).not.toContain('Tee A');
  });
});

describe('garment form', () => {
  it('local_required_errors_then_server_field_errors_are_shown_on_the_fields', async () => {
    wrap(<GarmentForm catalog={catalog} mode={{ kind: 'create' }} />);
    await userEvent.click(screen.getByRole('button', { name: fr('wardrobe.form.create') }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText(fr('wardrobe.form.errors.required'))).toHaveLength(3);

    await userEvent.selectOptions(screen.getByLabelText(`${fr('wardrobe.form.category')} *`), 'TOPS');
    await userEvent.selectOptions(screen.getByLabelText(`${fr('wardrobe.form.subtype')} *`), 'TSHIRT');
    await userEvent.selectOptions(screen.getByLabelText(`${fr('wardrobe.form.primaryColor')} *`), 'BLACK');
    fetchMock.mockResolvedValueOnce(problem(400, 'VALIDATION_ERROR', [{ path: 'primaryColor.code', message: 'Invalid option' }]));
    await userEvent.click(screen.getByRole('button', { name: fr('wardrobe.form.create') }));
    await waitFor(() => expect(screen.getByLabelText(`${fr('wardrobe.form.primaryColor')} *`).getAttribute('aria-invalid')).toBe('true'));
    expect(new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers).get('Idempotency-Key')).toBeTruthy();
  });

  it('edit_sends_if_match_and_a_409_offers_a_reload', async () => {
    fetchMock.mockResolvedValueOnce(problem(409, 'VERSION_CONFLICT'));
    wrap(<GarmentForm catalog={catalog} mode={{ kind: 'edit', garment: garment('11111111-1111-4111-8111-111111111111', 'Tee', 4) }} />);
    await userEvent.click(screen.getByRole('button', { name: fr('wardrobe.form.save') }));
    await screen.findByText(fr('wardrobe.form.conflictTitle'));
    expect(screen.getByRole('button', { name: fr('wardrobe.form.reload') })).toBeTruthy();
    expect(new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers).get('If-Match')).toBe('W/"v4"');
  });

  it('garment_cap_is_explained', async () => {
    fetchMock.mockResolvedValueOnce(problem(409, 'GARMENT_LIMIT_REACHED'));
    wrap(<GarmentForm catalog={catalog} mode={{ kind: 'duplicate', source: garment('11111111-1111-4111-8111-111111111111', 'Tee') }} />);
    await userEvent.click(screen.getByRole('button', { name: fr('wardrobe.form.duplicate') }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: fr('wardrobe.form.duplicate') }));
    await screen.findByText(fr('wardrobe.limits.garments'));
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/duplicate');
  });
});

describe('photos', () => {
  it('a_heic_or_oversized_file_is_refused_before_any_upload', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));
    wrap(<PhotoManager garmentId="11111111-1111-4111-8111-111111111111" name="Tee" onUnauthorized={() => {}} />);
    await screen.findByText(fr('wardrobe.photos.gallery'));
    const input = screen.getByLabelText(fr('wardrobe.photos.gallery')) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' })] } });
    expect((await screen.findByRole('alert')).textContent).toContain(fr('wardrobe.photos.errors.heic'));
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    await screen.findByText(fr('wardrobe.photos.errors.size'));
    expect(fetchMock).toHaveBeenCalledTimes(1); // the list only
  });
});
