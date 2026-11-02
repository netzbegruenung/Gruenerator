import { type CollectionContents } from '@gruenerator/shared/marketplace/frontpage';
import { stickersForLocale } from '@gruenerator/shared/profilbild';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfilbildStickerPicker } from './ProfilbildStickerPicker';

import { renderWithProviders } from '@/test-utils';

const subscribed = vi.hoisted(() => ({ contents: [] as unknown[] }));

vi.mock('@gruenerator/shared/marketplace', () => ({
  useSubscribedContents: () => subscribed.contents,
}));
vi.mock('@gruenerator/shared/studio-assets', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOwnStudioAssets: () => ({
    data: {
      items: [],
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      retry: () => {},
      fetchNextPage: () => {},
    },
    error: null,
  }),
}));
vi.mock('./ProfilbildMarketplaceButton', () => ({ ProfilbildMarketplaceButton: () => null }));
vi.mock('../../studio-assets/creator/StickerCreator', () => ({ StickerCreator: () => null }));

const [first] = stickersForLocale('de-DE');

const mustergruen = {
  collection: { id: 'mustergruen-wahlkampf', title: 'Mustergrün' },
  stickers: [{ ...first, id: 'mg-1', label: 'Mustersticker' }],
  frames: [],
  backgrounds: [],
  agents: [],
  sharepicVorlagen: [],
  printVorlagen: [],
} as unknown as CollectionContents;

const props = {
  locale: 'de-DE' as const,
  disabled: false,
  onAddSystem: vi.fn(),
  onAddAsset: vi.fn(),
};

beforeEach(() => {
  subscribed.contents = [];
});

describe('ProfilbildStickerPicker', () => {
  it('picker shows a group „Aus Mustergrün“ only when subscribed', () => {
    const { unmount } = renderWithProviders(<ProfilbildStickerPicker {...props} />);
    expect(screen.queryByRole('region', { name: 'Aus Mustergrün' })).not.toBeInTheDocument();
    unmount();

    subscribed.contents = [mustergruen];
    renderWithProviders(<ProfilbildStickerPicker {...props} />);
    const group = screen.getByRole('region', { name: 'Aus Mustergrün' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sticker Mustersticker hinzufügen' })).toBeEnabled();
  });
});
