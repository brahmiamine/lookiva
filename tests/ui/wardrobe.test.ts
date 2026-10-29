import { describe, expect, it } from 'vitest';
import { emptyGarmentForm, garmentName, labelOf, statusTone, toCreateBody, type Catalog, type Garment } from '@/ui/wardrobe';

describe('wardrobe form model', () => {
  it('create_body_trims_blank_text_to_null_and_leaves_weather_to_server', () => {
    const body = toCreateBody({ ...emptyGarmentForm, categoryCode: 'TOP', subtypeCode: 'TSHIRT', colorCode: 'BLUE', nickname: '  ', notes: ' soft ', seasons: ['SUMMER'] });
    expect(body).toEqual({ categoryCode: 'TOP', subtypeCode: 'TSHIRT', customSubcategoryId: null, primaryColor: { code: 'BLUE', shade: null }, nickname: null, seasons: ['SUMMER'], styles: [], notes: 'soft' });
    expect(body).not.toHaveProperty('warmth');
  });

  it('custom_subcategory_replaces_the_standard_subtype', () => {
    const body = toCreateBody({ ...emptyGarmentForm, categoryCode: 'TOP', subtypeCode: 'TSHIRT', customId: 'b3f1c2d4-0000-4000-8000-000000000001', colorCode: 'BLUE' });
    expect(body.subtypeCode).toBeNull();
    expect(body.customSubcategoryId).toBe('b3f1c2d4-0000-4000-8000-000000000001');
  });

  it('only_available_is_green_and_unknown_status_is_neutral', () => {
    expect(statusTone('AVAILABLE')).toBe('success');
    expect(statusTone('TO_WASH')).toBe('warning');
    expect(statusTone('SOMETHING_NEW')).toBe('neutral');
  });

  it('label_falls_back_to_french_and_name_prefers_nickname', () => {
    const labels = { fr: 'Haut', en: 'Top', ar: '' };
    expect(labelOf(labels, 'ar')).toBe('Haut');
    const catalog = { categories: [{ code: 'TOP', labels, subtypes: [] }] } as unknown as Catalog;
    const g = { nickname: null, categoryCode: 'TOP', subtypeCode: null, customSubcategory: null } as unknown as Garment;
    expect(garmentName(g, catalog, 'en')).toBe('Top');
    expect(garmentName({ ...g, nickname: 'Trench' }, catalog, 'en')).toBe('Trench');
  });
});
