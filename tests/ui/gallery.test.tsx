// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Gallery } from '@/ui/components/Gallery';
import { GarmentCard } from '@/ui/components/GarmentCard';
import { OutfitCard } from '@/ui/components/OutfitCard';
import { StatusBadge } from '@/ui/components/StatusBadge';

afterEach(cleanup);

const badge = <StatusBadge tone="success" label="Propre" icon="✓" />;

describe('cards and gallery', () => {
  it('garment_card_without_photo_shows_placeholder', () => {
    const { container } = render(<GarmentCard name="Trench camel" badge={badge} />);
    const placeholder = container.querySelector('[data-slot="placeholder"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Trench camel' })).toBeTruthy();
  });

  it('garment_card_with_photo_renders_image_and_badge', () => {
    const src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>';
    const { container } = render(<GarmentCard name="Jean brut" photoUrl={src} badge={badge} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('');
    expect(container.querySelector('[data-slot="placeholder"]')).toBeNull();
    expect(screen.getByText('Propre')).toBeTruthy();
    expect(screen.getByText('Jean brut')).toBeTruthy();
  });

  it('outfit_card_renders_title_occasion_and_count_label', () => {
    const { container } = render(
      <OutfitCard title="Look bureau" occasion="Travail" pieceCount={4} pieceCountLabel="4 pièces" badge={badge} />,
    );
    expect(screen.getByRole('heading', { name: 'Look bureau' })).toBeTruthy();
    expect(screen.getByText('Travail')).toBeTruthy();
    expect(screen.getByText('4 pièces')).toBeTruthy();
    expect(screen.getByText('Propre')).toBeTruthy();
    expect(container.querySelector('[data-piece-count="4"]')).not.toBeNull();
  });

  it('gallery_renders_children_in_a_grid', () => {
    render(
      <Gallery>
        <GarmentCard name="A" badge={badge} />
        <GarmentCard name="B" badge={badge} />
        <OutfitCard title="C" pieceCount={2} pieceCountLabel="2 pièces" />
      </Gallery>,
    );
    const list = screen.getByRole('list');
    expect(list.className).toContain('grid');
    expect(list.className).toContain('grid-cols-2');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });
});
