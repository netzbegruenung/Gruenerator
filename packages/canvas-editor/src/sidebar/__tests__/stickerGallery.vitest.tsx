import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '../../CanvasEditorProvider';
import { BrowseView } from '../sections/assets/BrowseView';
import { MobileCatalogView } from '../sections/assets/MobileCatalogView';
import { StickerCatalog } from '../sections/assets/StickerCatalog';

import type { AssetInstance } from '../../utils/canvasAssets';
import type { AssetSearchState } from '../sections/assets/useAssetSearch';
import type { StudioAssetItem } from '@gruenerator/contracts';
import type { StudioAssetsFilter } from '@gruenerator/shared/studio-assets';

const gallery = vi.hoisted(() => ({
  items: {} as Record<string, StudioAssetItem[]>,
  filters: [] as StudioAssetsFilter[],
  refetch: vi.fn(),
}));

// The real hook needs react-query, which this lane loads with a second React copy.
vi.mock('@gruenerator/shared/studio-assets', () => ({
  useStudioAssets: (filter: StudioAssetsFilter) => {
    gallery.filters.push(filter);
    return {
      items: gallery.items[`${filter.kind}:${filter.scope}`] ?? [],
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: async () => {},
      refetch: gallery.refetch,
    };
  },
}));

const UUID = '0b6f7a8e-3c2d-4e5f-9a1b-2c3d4e5f6a7b';
const SRC = '/api/share/0123456789abcdef0123456789abcdef/download';

function item(overrides: Partial<StudioAssetItem> = {}): StudioAssetItem {
  return {
    id: UUID,
    kind: 'sticker',
    title: 'Klimaherz',
    tags: [],
    src: SRC,
    thumbUrl: null,
    width: 400,
    height: 400,
    source: 'upload',
    visibility: 'public',
    audience: 'all',
    moderation: 'ok',
    isOwn: false,
    authorName: null,
    likesCount: 0,
    liked: false,
    favorited: false,
    createdAt: '2026-10-14T00:00:00Z',
    ...overrides,
  };
}

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const NO_SEARCH: AssetSearchState = {
  searchQuery: '',
  setSearchQuery: () => {},
  searchResults: [],
  hasQuery: false,
  isTyping: false,
  isSearching: false,
  showResults: false,
  showNoResults: false,
  deferredQuery: '',
};

beforeEach(() => {
  gallery.items = {};
  gallery.filters = [];
  gallery.refetch.mockReset();
  setViewport(false);
});

describe('StickerCatalog', () => {
  it('offers the system stickers first and the gallery lists as tabs', async () => {
    gallery.items['sticker:shop'] = [item()];
    const onAddAsset = vi.fn();
    const onAddStickerAsset = vi.fn();
    render(<StickerCatalog onAddAsset={onAddAsset} onAddStickerAsset={onAddStickerAsset} />);

    const tabs = screen.getByRole('tablist', { name: 'Sticker-Auswahl' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent)
    ).toEqual(['Grüne', 'Entdecken', 'Meine', 'Gemerkt']);
    expect(within(tabs).getByRole('tab', { name: 'Grüne' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // The gallery is only asked for once its tab is opened.
    expect(gallery.filters).toEqual([]);

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Entdecken' }));
    expect(gallery.filters.at(-1)).toEqual({ kind: 'sticker', scope: 'shop', q: '', sort: 'new' });

    await userEvent.click(screen.getByRole('button', { name: 'Klimaherz hinzufügen' }));
    expect(onAddStickerAsset).toHaveBeenCalledWith({ id: `asset:${UUID}`, src: SRC });
    expect(onAddAsset).not.toHaveBeenCalled();
  });

  it('lists own and remembered stickers and passes the card search', async () => {
    gallery.items['sticker:saved'] = [item({ title: 'Gemerkter' })];
    render(
      <StickerCatalog onAddAsset={() => {}} onAddStickerAsset={() => {}} searchQuery=" herz " />
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Meine' }));
    expect(gallery.filters.at(-1)).toMatchObject({ scope: 'mine', q: 'herz' });
    expect(screen.getByText('Keine Sticker für „herz“.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Gemerkt' }));
    expect(gallery.filters.at(-1)).toMatchObject({ scope: 'saved' });
    expect(screen.getByRole('button', { name: 'Gemerkter hinzufügen' })).toBeInTheDocument();
  });

  it('opens the host creator, shows "Meine" and refreshes it on return', async () => {
    const openStickerCreator = vi.fn();
    render(
      <CanvasEditorProvider services={{ openStickerCreator }}>
        <StickerCatalog onAddAsset={() => {}} onAddStickerAsset={() => {}} />
      </CanvasEditorProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sticker erstellen' }));
    expect(openStickerCreator).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tab', { name: 'Meine' })).toHaveAttribute('aria-selected', 'true');
    expect(gallery.refetch).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(gallery.refetch).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('focus'));
    expect(gallery.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows only the system stickers without a gallery handler or creator', () => {
    render(<StickerCatalog onAddAsset={() => {}} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sticker erstellen' })).not.toBeInTheDocument();
  });
});

describe('Sticker card in the sidebar', () => {
  it('opens the gallery tabs from the phone catalogue', async () => {
    setViewport(true);
    gallery.items['sticker:shop'] = [item()];
    const onAddStickerAsset = vi.fn();
    render(
      <MobileCatalogView
        search={NO_SEARCH}
        onAddAsset={() => {}}
        onAddStickerAsset={onAddStickerAsset}
      />
    );
    const heading = screen.getByRole('heading', { name: 'Sticker' });
    await userEvent.click(within(heading.parentElement!).getByRole('button', { name: 'Alle' }));

    await userEvent.click(screen.getByRole('tab', { name: 'Entdecken' }));
    await userEvent.click(screen.getByRole('button', { name: 'Klimaherz hinzufügen' }));
    expect(onAddStickerAsset).toHaveBeenCalledWith({ id: `asset:${UUID}`, src: SRC });
  });

  it('lists a placed gallery sticker under "Zuletzt" and adds it again by ref', async () => {
    const placed: AssetInstance = {
      id: 'a1',
      assetId: `asset:${UUID}`,
      src: SRC,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    };
    const forged: AssetInstance = { ...placed, id: 'a2', src: 'https://evil.example/x.png' };
    const onAddStickerAsset = vi.fn();
    render(
      <BrowseView
        search={NO_SEARCH}
        onAddAsset={() => {}}
        onAddStickerAsset={onAddStickerAsset}
        assetInstances={[forged, placed]}
      />
    );

    const strip = document.querySelector<HTMLElement>('[data-strip-id="recent"]')!;
    // The forged src is dropped: one tile, not two.
    const recent = within(strip).getByRole('button', { name: 'Sticker' });
    expect(recent.querySelector('img')?.getAttribute('src')).toBe(
      '/api/share/0123456789abcdef0123456789abcdef/preview?w=200&fmt=webp'
    );
    await userEvent.click(recent);
    expect(onAddStickerAsset).toHaveBeenCalledWith({ id: `asset:${UUID}`, src: SRC });
  });
});
