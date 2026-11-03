import { type ResolvedStoryBlock } from '@gruenerator/shared/marketplace';
import { describe, expect, it, vi } from 'vitest';

import { CollectionStory } from './CollectionStory';
import { type MarketplaceActions } from './useMarketplaceActions';

import { axe, renderWithProviders, screen, within } from '@/test-utils';

vi.mock('../vorlagen/hooks/useSharepicVorlagen', () => ({ useSharepicVorlagen: () => ({}) }));

const blocks = (kollektion: 'mustergruen-wahlkampf' | 'gruene-jugend'): ResolvedStoryBlock[] => [
  { type: 'profilbild', kollektion, heading: 'Fürs Profilbild' },
];
const render = (kollektion: 'mustergruen-wahlkampf' | 'gruene-jugend') =>
  renderWithProviders(
    <CollectionStory
      blocks={blocks(kollektion)}
      actions={{} as MarketplaceActions}
      onSelect={() => {}}
    />
  );

describe('CollectionStory profilbild picks', () => {
  it('lists frames under „Rahmen“ with ?rahmen= and not under „Sticker“', () => {
    render('mustergruen-wahlkampf');
    const frames = within(screen.getByRole('list', { name: 'Rahmen' }));
    const links = frames.getAllByRole('link');
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/studio\/profilbild\?rahmen=mg-rahmen-/);
      expect(link.getAttribute('aria-label')).toMatch(/als Rahmen im Profilbild verwenden$/);
    }
    const stickers = within(screen.getByRole('list', { name: 'Sticker' })).getAllByRole('link');
    expect(stickers).toHaveLength(8);
    expect(stickers.some((l) => l.getAttribute('href')?.includes('rahmen'))).toBe(false);
    expect(stickers.every((l) => l.getAttribute('href')?.includes('sticker='))).toBe(true);
  });

  it('covers a background overlay instead of squeezing it into the circle', () => {
    const { container } = render('mustergruen-wahlkampf');
    const overlays = container.querySelectorAll('a[href*="hintergrund="] img');
    expect(overlays.length).toBeGreaterThan(0);
    overlays.forEach((img) => expect(img).toHaveClass('object-cover'));
  });

  it('shows no Rahmen list for a collection without frames, and has no a11y violations', async () => {
    const { container } = render('gruene-jugend');
    expect(screen.queryByRole('list', { name: 'Rahmen' })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
