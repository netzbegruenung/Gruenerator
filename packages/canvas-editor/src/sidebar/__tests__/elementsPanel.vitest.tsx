import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import {
  ELEMENT_DRAG_TYPE,
  MEDIA_DRAG_TYPE,
  markDropPlaced,
} from '@ggraphic/editor/utils/mediaDrop';
import { UnsplashLimitError, useUnsplashSearch } from '@gruenerator/shared/image-studio';
import {
  fireEvent,
  render as rtlRender,
  renderHook,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BlockInsertContext, type BlockInsertApi } from '../../components/CanvasEditor/blockInsert';
import { useTrackUnsplashDownload } from '@ggraphic/editor/hooks/useTrackUnsplashDownload';
import { axe } from '../../test-utils';
import { ElementsPanel } from '@ggraphic/editor/sidebar/sections/assets/ElementsPanel';
import { ElementTile } from '@ggraphic/editor/sidebar/sections/assets/ElementTile';
import { dragDataFor } from '@ggraphic/editor/sidebar/sections/assets/elementTypes';
import { StickerCatalog } from '@ggraphic/editor/sidebar/sections/assets/StickerCatalog';
import {
  RECENT_ELEMENTS_LIMIT,
  sanitizeRecentItems,
  useRecentElements,
} from '@ggraphic/editor/sidebar/sections/assets/useRecentElements';
import { stockPhotoItem } from '@ggraphic/editor/sidebar/sections/assets/useStockPhotos';

import type { ElementItem } from '@ggraphic/editor/sidebar/sections/assets/elementTypes';
import type { CanvasStudioAssetsFilter } from '@ggraphic/editor/hostServices';
import type { SharepicBlock, StudioAssetItem } from '@gruenerator/contracts';
import type { ReactElement, ReactNode } from 'react';

const gallery = vi.hoisted(() => ({
  items: {} as Record<string, StudioAssetItem[]>,
  filters: [] as CanvasStudioAssetsFilter[],
  refetch: vi.fn(),
}));

// The host's hooks, injected through the services seam. The studio-assets one
// is a fake: the real hook needs react-query, which this lane loads with a
// second React copy. The Unsplash one is the real @gruenerator/shared hook.
const hostHooks: CanvasEditorServices = {
  useStudioAssets: (filter) => {
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
  useUnsplashSearch,
};
const HostWrapper = ({ children }: { children: ReactNode }) => (
  <CanvasEditorProvider services={hostHooks}>{children}</CanvasEditorProvider>
);
const render = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: HostWrapper, ...options });
// The real Icon fetches its set over the network on a timer that can outlive jsdom.
vi.mock('@iconify/react', () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { initialData?: () => unknown }) => ({
    data: options.initialData?.(),
    isLoading: false,
  }),
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
    isOfficial: false,
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

/** The search is debounced: type, then wait for the results heading. */
async function search(text: string) {
  await userEvent.type(screen.getByRole('searchbox'), text);
  await vi.waitFor(
    () => expect(screen.getByText(new RegExp(`für „${text}“`))).toBeInTheDocument(),
    {
      timeout: 1500,
    }
  );
}

// jsdom has no IntersectionObserver; the grid only needs it to load the next page.
class NoIntersectionObserver {
  observe() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', NoIntersectionObserver);

beforeEach(() => {
  gallery.items = {};
  gallery.filters = [];
  gallery.refetch.mockReset();
  useRecentElements.setState({ items: [] });
  setViewport(false);
});

describe('StickerCatalog', () => {
  it('offers the system stickers first and the gallery lists as tabs', async () => {
    gallery.items['sticker:shop'] = [item()];
    const onAddStickerAsset = vi.fn();
    render(
      <StickerCatalog onAddStickerAsset={onAddStickerAsset} canDrag={false}>
        <p>System-Sticker</p>
      </StickerCatalog>
    );

    const tabs = screen.getByRole('group', { name: 'Sticker-Auswahl' });
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((t) => t.textContent)
    ).toEqual(['Grüne', 'Entdecken', 'Meine', 'Gemerkt']);
    expect(screen.getByText('System-Sticker')).toBeInTheDocument();
    // The gallery is only asked for once its tab is opened.
    expect(gallery.filters).toEqual([]);

    await userEvent.click(within(tabs).getByRole('button', { name: 'Entdecken' }));
    expect(gallery.filters.at(-1)).toEqual({ kind: 'sticker', scope: 'shop', q: '', sort: 'new' });

    await userEvent.click(screen.getByRole('button', { name: 'Klimaherz hinzufügen' }));
    expect(onAddStickerAsset).toHaveBeenCalledWith({ id: `asset:${UUID}`, src: SRC });
  });

  it('lists own and remembered stickers and passes the search', async () => {
    gallery.items['sticker:saved'] = [item({ title: 'Gemerkter' })];
    render(
      <StickerCatalog onAddStickerAsset={() => {}} searchQuery=" herz " canDrag={false}>
        {null}
      </StickerCatalog>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Meine' }));
    expect(gallery.filters.at(-1)).toMatchObject({ scope: 'mine', q: 'herz' });
    expect(screen.getByText('Keine Sticker für „herz“.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Gemerkt' }));
    expect(gallery.filters.at(-1)).toMatchObject({ scope: 'saved' });
    expect(screen.getByRole('button', { name: 'Gemerkter hinzufügen' })).toBeInTheDocument();
  });

  it('opens the host creator, shows "Meine" and refreshes it on return', async () => {
    const openStickerCreator = vi.fn();
    render(
      <CanvasEditorProvider services={{ ...hostHooks, openStickerCreator }}>
        <StickerCatalog onAddStickerAsset={() => {}} canDrag={false}>
          {null}
        </StickerCatalog>
      </CanvasEditorProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sticker erstellen' }));
    expect(openStickerCreator).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Meine' })).toHaveAttribute('aria-pressed', 'true');
    expect(gallery.refetch).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(gallery.refetch).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('focus'));
    expect(gallery.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows only the system stickers without a gallery handler', () => {
    render(
      <StickerCatalog canDrag={false}>
        <p>System-Sticker</p>
      </StickerCatalog>
    );
    expect(screen.getByText('System-Sticker')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Sticker-Auswahl' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sticker erstellen' })).not.toBeInTheDocument();
  });
});

describe('ElementsPanel', () => {
  it('starts with the brand row and one card per offered category', () => {
    render(<ElementsPanel onAddAsset={() => {}} onAddShape={() => {}} onAddChart={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Eure Marke' })).toBeInTheDocument();
    for (const label of ['Sticker', 'Formen', 'Diagramme', 'Emoji'])
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    // No handler, no card.
    expect(screen.queryByRole('button', { name: /^Rahmen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Fotos/ })).not.toBeInTheDocument();
  });

  it('opens a category and goes back', async () => {
    const onAddShape = vi.fn();
    render(<ElementsPanel onAddShape={onAddShape} />);

    await userEvent.click(screen.getByRole('button', { name: /^Formen/ }));
    expect(screen.getByRole('heading', { name: 'Formen' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'In Formen suchen' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Kreis hinzufügen' }));
    expect(onAddShape).toHaveBeenCalledWith('circle', expect.any(String));

    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu allen Elementen' }));
    expect(screen.getByRole('heading', { name: 'Kategorien durchsuchen' })).toBeInTheDocument();
  });

  it('remembers an added element under "Zuletzt verwendet"', async () => {
    render(<ElementsPanel onAddShape={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Zuletzt verwendet' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Formen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Kreis hinzufügen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu allen Elementen' }));

    expect(screen.getByRole('heading', { name: 'Zuletzt verwendet' })).toBeInTheDocument();
    expect(useRecentElements.getState().items.map((i) => i.key)).toEqual(['shape:circle']);
  });

  it('searches everywhere and says when nothing matches', async () => {
    render(<ElementsPanel onAddShape={() => {}} onAddChart={() => {}} />);

    await search('kreis');
    expect(screen.getByRole('button', { name: 'Kreis hinzufügen' })).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox'));
    await search('zzzz');
    expect(screen.getByText('Nichts gefunden')).toBeInTheDocument();
  });

  it('offers "Überall suchen" inside a category', async () => {
    render(<ElementsPanel onAddShape={() => {}} onAddChart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Diagramme/ }));
    await search('kreis');
    expect(screen.queryByRole('button', { name: 'Kreis hinzufügen' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Überall suchen' }));
    expect(await screen.findByRole('button', { name: 'Kreis hinzufügen' })).toBeInTheDocument();
  });

  it('puts an element payload on a dragged tile on desktop', async () => {
    render(<ElementsPanel onAddShape={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Formen/ }));
    const tile = screen.getByRole('button', { name: 'Kreis hinzufügen' });
    expect(tile).toHaveAttribute('draggable', 'true');

    const data: Record<string, string> = {};
    fireEvent.dragStart(tile, {
      dataTransfer: {
        setData: (type: string, value: string) => (data[type] = value),
        setDragImage: () => {},
        effectAllowed: '',
      },
    });
    expect(JSON.parse(data[ELEMENT_DRAG_TYPE]!)).toMatchObject({
      kind: 'shape',
      shapeType: 'circle',
    });
  });

  it('does not offer drag on the phone sheet', async () => {
    setViewport(true);
    render(<ElementsPanel onAddShape={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Formen/ }));
    expect(screen.getByRole('button', { name: 'Kreis hinzufügen' })).toHaveAttribute(
      'draggable',
      'false'
    );
  });

  it('drags a gallery sticker by ref and remembers it once the page takes it', async () => {
    gallery.items['sticker:shop'] = [item()];
    render(<ElementsPanel onAddAsset={() => {}} onAddStickerAsset={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Sticker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Entdecken' }));
    const tile = screen.getByRole('button', { name: 'Klimaherz hinzufügen' });
    expect(tile).toHaveAttribute('draggable', 'true');

    const data: Record<string, string> = {};
    const dragStart = () =>
      fireEvent.dragStart(tile, {
        dataTransfer: {
          setData: (type: string, value: string) => (data[type] = value),
          setDragImage: () => {},
          effectAllowed: '',
        },
      });
    dragStart();
    expect(JSON.parse(data[ELEMENT_DRAG_TYPE]!)).toEqual({
      kind: 'sticker',
      ref: { id: `asset:${UUID}`, src: SRC },
    });

    // The browser reports `copy` for a drop the page refused.
    fireEvent.dragEnd(tile, { dataTransfer: { dropEffect: 'copy' } });
    expect(useRecentElements.getState().items).toEqual([]);

    // A placed drop left over from another drag does not count for this one.
    markDropPlaced();
    dragStart();
    fireEvent.dragEnd(tile, { dataTransfer: { dropEffect: 'copy' } });
    expect(useRecentElements.getState().items).toEqual([]);

    dragStart();
    markDropPlaced();
    fireEvent.dragEnd(tile, { dataTransfer: { dropEffect: 'copy' } });
    expect(useRecentElements.getState().items[0]?.key).toBe(`sticker:asset:${UUID}`);
  });

  it('keeps gallery stickers click-only on the phone sheet', async () => {
    setViewport(true);
    gallery.items['sticker:shop'] = [item()];
    render(<ElementsPanel onAddAsset={() => {}} onAddStickerAsset={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Sticker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Entdecken' }));
    expect(screen.getByRole('button', { name: 'Klimaherz hinzufügen' })).not.toHaveAttribute(
      'draggable',
      'true'
    );
  });

  it('adds a gallery sticker from the phone sheet and remembers it by ref', async () => {
    setViewport(true);
    gallery.items['sticker:shop'] = [item()];
    const onAddStickerAsset = vi.fn();
    render(<ElementsPanel onAddAsset={() => {}} onAddStickerAsset={onAddStickerAsset} />);

    await userEvent.click(screen.getByRole('button', { name: /^Sticker/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Entdecken' }));
    await userEvent.click(screen.getByRole('button', { name: 'Klimaherz hinzufügen' }));

    expect(onAddStickerAsset).toHaveBeenCalledWith({ id: `asset:${UUID}`, src: SRC });
    expect(useRecentElements.getState().items[0]?.action).toEqual({
      kind: 'sticker',
      ref: { id: `asset:${UUID}`, src: SRC },
    });
  });
});

describe('icon tiles', () => {
  const sun: ElementItem = {
    key: 'icon:tabler-sun',
    label: 'sun',
    keywords: ['sun'],
    action: { kind: 'icon', iconId: 'tabler-sun' },
    thumb: { t: 'icon', iconId: 'tabler-sun' },
  };
  const tile = (selected: boolean, disabled = false, onActivate = () => {}) => (
    <ElementTile
      item={sun}
      variant="grid"
      onActivate={onActivate}
      enterIndex={null}
      canDrag
      selected={selected}
      disabled={disabled}
    />
  );

  it('drag the icon onto a page', () => {
    render(tile(false));
    const button = screen.getByRole('button', { name: 'sun hinzufügen' });
    expect(button).toHaveAttribute('draggable', 'true');
    expect(dragDataFor(sun.action)).toEqual({
      type: ELEMENT_DRAG_TYPE,
      data: JSON.stringify({ kind: 'icon', iconId: 'tabler-sun' }),
    });
  });

  // The active page's state; another page may still take the icon.
  it('drag an icon the active page already shows', () => {
    render(tile(true));
    expect(screen.getByRole('button', { name: 'sun hinzufügen' })).toHaveAttribute(
      'draggable',
      'true'
    );
  });

  it('drag but do not click an icon while the active page is full', async () => {
    const onActivate = vi.fn();
    render(tile(false, true, onActivate));
    const button = screen.getByRole('button', { name: 'sun hinzufügen' });
    expect(button).toHaveAttribute('draggable', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe('recent elements storage', () => {
  const shape: ElementItem = {
    key: 'shape:circle',
    label: 'Kreis',
    keywords: [],
    action: { kind: 'shape', shapeType: 'circle' },
    thumb: { t: 'shape', shapeType: 'circle' },
  };

  it('keeps the newest twelve, each once', () => {
    const { remember } = useRecentElements.getState();
    for (let i = 0; i < RECENT_ELEMENTS_LIMIT + 3; i++)
      remember({ ...shape, key: `shape:${i}`, label: String(i) });
    remember({ ...shape, key: 'shape:5' });
    const keys = useRecentElements.getState().items.map((i) => i.key);
    expect(keys).toHaveLength(RECENT_ELEMENTS_LIMIT);
    expect(keys[0]).toBe('shape:5');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('drops malformed entries and sources the catalogue could not have produced', () => {
    const forgedSticker = {
      ...shape,
      key: 'sticker:x',
      action: { kind: 'sticker', ref: { id: 'asset:x', src: 'https://evil.example/x.png' } },
    };
    const forgedPhoto = {
      ...shape,
      key: 'photo:x',
      action: { kind: 'media', url: 'https://evil.example/x.jpg', name: 'x' },
    };
    expect(
      sanitizeRecentItems([shape, forgedSticker, forgedPhoto, { key: 1 }, null]).map((i) => i.key)
    ).toEqual(['shape:circle']);
    expect(sanitizeRecentItems('kaputt')).toEqual([]);
  });
});

describe('stock photo tiles', () => {
  it('place the bundled file with its Unsplash credit and drag as media', () => {
    const tile = stockPhotoItem({
      filename: 'a b.jpg',
      category: 'transport',
      tags: ['train'],
      alt_text: 'A train',
      attribution: { photographer: 'Ana', profileUrl: 'https://u/ana', photoUrl: 'https://u/p' },
    });
    expect(tile.action).toEqual({
      kind: 'media',
      url: '/api/image-picker/stock-image/a%20b.jpg',
      name: 'A train',
      attribution: { photographer: 'Ana', profileUrl: 'https://u/ana', photoUrl: 'https://u/p' },
    });
    // Labelled with the credit, findable by its German category name and own tags.
    expect(tile.label).toBe('Ana');
    expect(tile.keywords).toEqual(expect.arrayContaining(['Mobilität', 'train']));
    // Media, not element: a drop onto a frame fills the frame with the photo.
    expect(dragDataFor(tile.action)?.type).toBe(MEDIA_DRAG_TYPE);
  });

  it('ping Unsplash on placement only when the photo has a download location', () => {
    const trackUnsplashDownloadLive = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useTrackUnsplashDownload(), {
      wrapper: ({ children }) => (
        <CanvasEditorProvider services={{ ...hostHooks, trackUnsplashDownloadLive }}>
          {children}
        </CanvasEditorProvider>
      ),
    });
    const credit = { photographer: 'Ana', profileUrl: 'https://u/ana', photoUrl: 'https://u/p' };

    result.current('a.jpg', credit);
    expect(trackUnsplashDownloadLive).not.toHaveBeenCalled();

    result.current('a.jpg', { ...credit, downloadLocation: 'https://api.unsplash.com/d/1' });
    expect(trackUnsplashDownloadLive).toHaveBeenCalledWith('https://api.unsplash.com/d/1');
  });

  it('carry no credit when the catalogue has only the placeholder', () => {
    const tile = stockPhotoItem({
      filename: 'x.jpg',
      attribution: { photographer: 'Unknown', profileUrl: '', photoUrl: '' },
    });
    expect(tile.action).not.toHaveProperty('attribution');
  });
});

describe('ElementsPanel — Fotos mit Unsplash', () => {
  const unsplashPhoto = {
    filename: 'annie-1-unsplash.jpg',
    url: 'https://images.unsplash.com/photo-1?ixid=x',
    alt_text: 'Wald im Nebel',
    attribution: {
      photographer: 'Annie Spratt',
      profileUrl: 'https://unsplash.com/@annie',
      photoUrl: 'https://unsplash.com/photos/1',
      downloadLocation: 'https://api.unsplash.com/photos/1/download',
    },
  };

  function renderFotos(searchUnsplashImages: CanvasEditorServices['searchUnsplashImages']) {
    const onAddImageFromUrl = vi.fn();
    const trackUnsplashDownloadLive = vi.fn(async () => {});
    const services: CanvasEditorServices = {
      ...hostHooks,
      fetchStockImages: async () => ({ success: true, images: [], categories: [] }),
      trackUnsplashDownloadLive,
      ...(searchUnsplashImages ? { searchUnsplashImages } : {}),
    };
    const view = render(
      <CanvasEditorProvider services={services}>
        <ElementsPanel onAddImageFromUrl={onAddImageFromUrl} />
      </CanvasEditorProvider>
    );
    return { ...view, onAddImageFromUrl, trackUnsplashDownloadLive };
  }

  async function openFotosAndSearch(text: string) {
    await userEvent.click(screen.getByRole('button', { name: /^Fotos/ }));
    await search(text);
  }

  it('searches Unsplash after a typing pause and places the hotlinked photo with its credit', async () => {
    const searchUnsplashImages = vi.fn(async () => ({
      results: [unsplashPhoto],
      total: 1,
      total_pages: 1,
    }));
    const { container, onAddImageFromUrl, trackUnsplashDownloadLive } =
      renderFotos(searchUnsplashImages);

    await openFotosAndSearch('wald');
    // No local hit hides nothing: the Unsplash section stays.
    expect(screen.queryByText('Nichts gefunden')).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Annie Spratt hinzufügen' }, { timeout: 2000 })
    );
    // One search for the settled query, not one per keystroke.
    expect(searchUnsplashImages).toHaveBeenCalledTimes(1);
    expect(searchUnsplashImages).toHaveBeenCalledWith('wald', 1, 20);
    expect(onAddImageFromUrl).toHaveBeenCalledWith(unsplashPhoto.url, 'Wald im Nebel', {
      attribution: unsplashPhoto.attribution,
    });
    expect(trackUnsplashDownloadLive).toHaveBeenCalledWith(
      unsplashPhoto.attribution.downloadLocation
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says when the shared hourly quota is used up and stops asking', async () => {
    const searchUnsplashImages = vi.fn(async () => {
      throw new UnsplashLimitError(1800);
    });
    renderFotos(searchUnsplashImages);

    await openFotosAndSearch('wald');

    expect(
      await screen.findByText('Unsplash-Suche gerade ausgeschöpft', {}, { timeout: 2000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/50 Unsplash-Suchen pro Stunde/)).toBeInTheDocument();

    // Blocked: a new query does not run into the same refusal again.
    await userEvent.type(screen.getByRole('searchbox'), 'see');
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(searchUnsplashImages).toHaveBeenCalledTimes(1);
  });

  it('offers no Unsplash search without the service', async () => {
    renderFotos(undefined);
    await openFotosAndSearch('wald');
    expect(screen.queryByText('Mehr von Unsplash')).not.toBeInTheDocument();
    expect(screen.getByText('Nichts gefunden')).toBeInTheDocument();
  });
});

describe('ElementsPanel — Blöcke', () => {
  const block = (
    id: string,
    titel: string,
    gruppe: SharepicBlock['gruppe'],
    stichworte: string[]
  ) =>
    ({
      id,
      titel,
      gruppe,
      stichworte,
      color: 'mint',
      locale: 'de-DE',
      items: [{ type: 'liste', items: ['A', 'B'] }],
    }) satisfies SharepicBlock;

  function renderWithBlocks(insert = vi.fn(async () => true)) {
    const api: BlockInsertApi = {
      bloecke: [
        block('de-block-pfeile', 'Liste mit Pfeilen', 'listen', ['Aufzählung']),
        block('de-block-zitat', 'Zitat', 'text', ['Statement']),
        block('de-block-kopf', 'Kopf mit Dachzeile', 'kopf', ['Überschrift']),
      ],
      isLoading: false,
      insert,
    };
    render(
      <BlockInsertContext.Provider value={api}>
        <ElementsPanel onAddShape={() => {}} />
      </BlockInsertContext.Provider>
    );
    return insert;
  }

  it('offers the category only when the editor has blocks for the page', () => {
    render(<ElementsPanel onAddShape={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Blöcke/ })).not.toBeInTheDocument();
  });

  it('shows the blocks under their groups and inserts one on click', async () => {
    const insert = renderWithBlocks();
    await userEvent.click(screen.getByRole('button', { name: /^Blöcke/ }));
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings.filter((h) => ['Kopf', 'Listen', 'Text'].includes(h ?? ''))).toEqual([
      'Kopf',
      'Listen',
      'Text',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Zitat hinzufügen' }));
    expect(insert).toHaveBeenCalledWith('de-block-zitat');
    expect(useRecentElements.getState().items.map((i) => i.key)).toEqual(['block:de-block-zitat']);
  });

  it('drags a block by its id on desktop', async () => {
    renderWithBlocks();
    await userEvent.click(screen.getByRole('button', { name: /^Blöcke/ }));
    const data: Record<string, string> = {};
    fireEvent.dragStart(screen.getByRole('button', { name: 'Liste mit Pfeilen hinzufügen' }), {
      dataTransfer: {
        setData: (type: string, value: string) => (data[type] = value),
        setDragImage: () => {},
        effectAllowed: '',
      },
    });
    expect(JSON.parse(data[ELEMENT_DRAG_TYPE]!)).toEqual({
      kind: 'block',
      blockId: 'de-block-pfeile',
    });
  });

  it('finds a block by its search words', async () => {
    renderWithBlocks();
    await search('Aufzählung');
    expect(
      screen.getByRole('button', { name: 'Liste mit Pfeilen hinzufügen' })
    ).toBeInTheDocument();
  });

  it('hides a remembered block the page cannot take', () => {
    useRecentElements.setState({
      items: [
        {
          key: 'block:at-block-x',
          label: 'Fremd',
          keywords: [],
          action: { kind: 'block', blockId: 'at-block-x' },
          thumb: { t: 'img', src: '/x.webp' },
        },
      ],
    });
    renderWithBlocks();
    expect(screen.queryByRole('heading', { name: 'Zuletzt verwendet' })).not.toBeInTheDocument();
  });
});
