import { expect, it } from 'vitest';
import { parseGarmentSelection } from '@/app/[locale]/(app)/tenues/logic';
it('bounds URL selections and rejects repeated parameters, duplicate IDs and malformed IDs', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  expect(parseGarmentSelection(undefined)).toEqual([]);
  expect(parseGarmentSelection(id)).toEqual([id]);
  for (const value of [[id, id], `${id},${id}`, 'bad', Array.from({ length: 31 }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`).join(',')]) expect(parseGarmentSelection(value)).toBeNull();
});
