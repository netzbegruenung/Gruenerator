import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageBackgroundSection } from '../sections/ImageBackgroundSection';

import type { StockImage } from '../../common/imageSourceTypes';
import type { StudioAssetItem } from '@gruenerator/contracts';
import type { MediaItem } from '@gruenerator/shared/media-library';
import type { StudioAssetsFilter } from '@gruenerator/shared/studio-assets';

const upload = vi.fn<(file: File) => Promise<MediaItem | null>>();
const unsplash = vi.hoisted(() => ({ results: [] as StockImage[] }));
const library = vi.hoisted(() => ({ items: [] as MediaItem[] }));
const gallery = vi.hoisted(() => ({
  items: [] as StudioAssetItem[],
  filters: [] as StudioAssetsFilter[],
}));

// The real hook needs react-query, which this lane loads with a second React copy.
vi.mock('@gruenerator/shared/studio-assets', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStudioAssets: (filter: StudioAssetsFilter) => {
    gallery.filters.push(filter);
    return {
      items: filter.kind === 'background' && filter.scope === 'shop' ? gallery.items : [],
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: async () => {},
      refetch: async () => {},
    };
  },
}));

vi.mock('../../hooks/useUnsplashSearch', () => ({
  useUnsplashSearch: () => ({
    searchResults: unsplash.results,
    totalResults: unsplash.results.length,
    searchUnsplash: async () => {},
    loadMoreResults: async () => {},
    isLoadingSearch: false,
    searchError: null,
    clearSearch: () => {},
  }),
}));

vi.mock('../UserUploadsProvider', () => ({
  useUserUploads: () => ({
    items: library.items,
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload,
    deleteFromLibrary: async () => true,
    isUploading: false,
    uploadProgress: 0,
    uploadError: null,
    hasMore: false,
    loadMore: async () => {},
  }),
}));

// jsdom cannot decode images; the real helper is covered elsewhere.
vi.mock('../../utils/userImageUtils', () => ({
  downscaleImageForUpload: (file: File) => Promise.resolve(file),
}));

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const PHOTO = 'https://example.org/api/share/current/download';
const COLORS = [
  { id: 'tanne', label: 'Tanne', color: '#005538' },
  { id: 'klee', label: 'Klee', color: '#008939' },
];

function libraryItem(): MediaItem {
  return {
    id: 'm1',
    shareToken: 'tok1',
    mediaType: 'image',
    title: null,
    thumbnailUrl: null,
    fileSize: 3,
    mimeType: 'image/png',
    altText: null,
    uploadSource: 'upload',
    originalFilename: 'eigen.png',
    downloadCount: 0,
    viewCount: 0,
    createdAt: '2026-10-07T00:00:00Z',
  } as MediaItem;
}

const pickFile = async () => {
  const file = new File(['png'], 'eigen.png', { type: 'image/png' });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  await userEvent.upload(input, file);
  return file;
};

describe.each([true, false])('ImageBackgroundSection (mobile: %s)', (mobile) => {
  beforeEach(() => {
    setViewport(mobile);
    upload.mockReset();
  });

  // The ring (mobile: accent shadow; desktop: ring-2 + check badge) is how the
  // tile says "this is the background".
  const SELECTED_MARK = /editor-accent|ring-2/;

  it('shows the current background photo as the selected tile', () => {
    render(<ImageBackgroundSection currentImageSrc={PHOTO} onImageChange={() => {}} />);
    const img = screen.getByRole('img', { name: 'Aktuelles Hintergrundbild' });
    expect(img.getAttribute('src')).toContain('current');
    expect(screen.getByTitle('Aktuelles Hintergrundbild').className).toMatch(SELECTED_MARK);
    expect(screen.getByRole('button', { name: 'Hintergrund entfernen' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Bild wieder als Hintergrund verwenden' })
    ).not.toBeInTheDocument();
  });

  it('removing the photo clears its credit too', async () => {
    const onImageChange = vi.fn();
    render(<ImageBackgroundSection currentImageSrc={PHOTO} onImageChange={onImageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hintergrund entfernen' }));
    // The templates only touch the credit when one is passed; undefined left it.
    expect(onImageChange).toHaveBeenCalledWith(null, undefined, null);
  });

  it('pins a replaced photo unselected and brings it back on tap', async () => {
    const onImageChange = vi.fn();
    const onActivateImage = vi.fn();
    render(
      <ImageBackgroundSection
        currentImageSrc={PHOTO}
        onImageChange={onImageChange}
        onActivateImage={onActivateImage}
      />
    );
    expect(screen.queryByTitle('Aktuelles Hintergrundbild')).not.toBeInTheDocument();
    const tile = screen.getByTitle('Früheres Hintergrundbild');
    expect(tile.className).not.toMatch(SELECTED_MARK);
    expect(
      screen.queryByRole('img', { name: 'Aktuelles Hintergrundbild' })
    ).not.toBeInTheDocument();
    const reuse = within(tile).getByRole('button', {
      name: 'Bild wieder als Hintergrund verwenden',
    });
    expect(reuse).not.toHaveAttribute('aria-pressed');

    await userEvent.click(reuse);
    expect(onActivateImage).toHaveBeenCalledTimes(1);
    expect(onImageChange).not.toHaveBeenCalled();

    await userEvent.click(within(tile).getByRole('button', { name: 'Früheres Bild verwerfen' }));
    expect(onImageChange).toHaveBeenCalledWith(null, undefined, null);
  });

  it('uploads an own image into the library and applies its durable URL', async () => {
    upload.mockResolvedValue(libraryItem());
    const onImageChange = vi.fn();
    render(<ImageBackgroundSection onImageChange={onImageChange} />);

    const button = screen.getByRole('button', { name: 'Eigenes Bild hochladen' });
    expect(button).toBeEnabled();
    const file = await pickFile();

    await waitFor(() =>
      expect(onImageChange).toHaveBeenCalledWith(file, '/api/share/tok1/download', null)
    );
    expect(upload).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a failed upload and leaves the background alone', async () => {
    upload.mockResolvedValue(null);
    const onImageChange = vi.fn();
    render(<ImageBackgroundSection onImageChange={onImageChange} />);

    await pickFile();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bild konnte nicht hochgeladen werden'
    );
    expect(onImageChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Eigenes Bild hochladen' })).toBeEnabled();
  });

  it('reports a thrown upload error', async () => {
    upload.mockRejectedValue(new Error('network'));
    const onImageChange = vi.fn();
    render(<ImageBackgroundSection onImageChange={onImageChange} />);

    await pickFile();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bild konnte nicht hochgeladen werden'
    );
    expect(onImageChange).not.toHaveBeenCalled();
  });
});

describe.each([true, false])('the earlier photo (mobile: %s)', (mobile) => {
  beforeEach(() => {
    setViewport(mobile);
    unsplash.results = [];
  });

  it('moves focus to the selected tile once it is the background again', async () => {
    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <ImageBackgroundSection
          currentImageSrc={PHOTO}
          onImageChange={() => {}}
          onActivateImage={active ? undefined : () => setActive(true)}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Bild wieder als Hintergrund verwenden' })
    );
    const tile = screen.getByTitle('Aktuelles Hintergrundbild');
    expect(tile).toHaveFocus();
  });

  it('does not mark its Unsplash result as selected while it is not the background', () => {
    unsplash.results = [{ filename: 'u1.jpg', url: PHOTO, alt_text: 'Wald' }];
    const { rerender } = render(
      <ImageBackgroundSection
        currentImageSrc={PHOTO}
        onImageChange={() => {}}
        onActivateImage={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Wald' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<ImageBackgroundSection currentImageSrc={PHOTO} onImageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Wald' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ImageBackgroundSection on the phone sheet', () => {
  beforeEach(() => setViewport(true));

  it('can open on the colour tab', () => {
    render(
      <ImageBackgroundSection
        onImageChange={() => {}}
        backgroundColor="#008939"
        backgroundColors={COLORS}
        onBackgroundColorChange={() => {}}
        initialSubsection="background-color"
      />
    );
    const tabs = screen.getByRole('tablist', { name: 'Ansicht' });
    expect(within(tabs).getByRole('tab', { name: 'Farbe' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('shows the pending state while uploading', async () => {
    let resolve: (item: MediaItem | null) => void = () => {};
    upload.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<ImageBackgroundSection onImageChange={() => {}} />);
    await pickFile();

    const busy = await screen.findByRole('button', { name: 'Bild wird hochgeladen…' });
    expect(busy).toBeDisabled();
    resolve(null);
    await screen.findByRole('alert');
  });
});

describe('colour swatches', () => {
  it.each([true, false])('select a seeded colour regardless of hex case (mobile: %s)', (mobile) => {
    setViewport(mobile);
    render(
      <ImageBackgroundSection
        onImageChange={() => {}}
        backgroundColor="#FFFFFF"
        backgroundColors={[...COLORS, { id: 'weiss', label: 'Weiß', color: '#ffffff' }]}
        onBackgroundColorChange={() => {}}
        initialSubsection="background-color"
      />
    );
    expect(screen.getByRole('button', { name: 'Weiß' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tanne' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe.each([true, false])('a library photo as background (mobile: %s)', (mobile) => {
  const item = (id: string): MediaItem => ({ ...libraryItem(), id, shareToken: `tok-${id}` });
  const tileOrder = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[title]'))
      .map((el) => el.getAttribute('title'))
      .filter((t) => t === 'Aktuelles Hintergrundbild' || t === 'eigen.png');

  beforeEach(() => {
    setViewport(mobile);
    unsplash.results = [];
    library.items = [item('a'), item('b'), item('c')];
  });
  afterEach(() => {
    library.items = [];
  });

  it('is marked in its own slot, so the grid does not reflow under the pointer', () => {
    const { rerender } = render(
      <ImageBackgroundSection
        currentImageSrc="/api/share/tok-a/download"
        onImageChange={() => {}}
      />
    );
    expect(tileOrder()).toEqual(['Aktuelles Hintergrundbild', 'eigen.png', 'eigen.png']);

    rerender(
      <ImageBackgroundSection
        currentImageSrc="/api/share/tok-b/download"
        onImageChange={() => {}}
      />
    );
    expect(tileOrder()).toEqual(['eigen.png', 'Aktuelles Hintergrundbild', 'eigen.png']);
  });

  it('is brought back in place when a colour replaced it', async () => {
    const onActivateImage = vi.fn();
    render(
      <ImageBackgroundSection
        currentImageSrc="/api/share/tok-b/download"
        onImageChange={() => {}}
        onActivateImage={onActivateImage}
      />
    );
    const tile = screen.getByTitle('Früheres Hintergrundbild');
    await userEvent.click(
      within(tile).getByRole('button', { name: 'Bild wieder als Hintergrund verwenden' })
    );
    expect(onActivateImage).toHaveBeenCalledTimes(1);
  });
});

describe.each([true, false])('gallery backgrounds (mobile: %s)', (mobile) => {
  const TOKEN = '0123456789abcdef0123456789abcdef';
  const SRC = `/api/share/${TOKEN}/download`;
  const wald: StudioAssetItem = {
    id: '0b6f7a8e-3c2d-4e5f-9a1b-2c3d4e5f6a7b',
    kind: 'background',
    title: 'Waldlichtung',
    tags: [],
    src: SRC,
    thumbUrl: null,
    width: 2160,
    height: 2160,
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
  };
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    setViewport(mobile);
    gallery.items = [wald];
    gallery.filters = [];
    fetchMock.mockReset();
    // jsdom's Blob cannot back undici's Response; the pick only reads ok + blob().
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['webp'], { type: 'image/webp' })),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openGallery = async () => {
    if (mobile) await userEvent.click(screen.getByRole('tab', { name: 'Hintergründe' }));
  };

  it('sets a picked gallery background as the photo, by its own durable URL', async () => {
    const onImageChange = vi.fn();
    render(<ImageBackgroundSection onImageChange={onImageChange} />);
    await openGallery();

    const scopes = screen.getByRole('group', { name: 'Hintergrund-Auswahl' });
    expect(
      within(scopes)
        .getAllByRole('button')
        .map((t) => t.textContent)
    ).toEqual(['Entdecken', 'Meine', 'Gemerkt']);
    expect(gallery.filters.at(-1)).toEqual({
      kind: 'background',
      scope: 'shop',
      q: '',
      sort: 'new',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Waldlichtung als Hintergrund verwenden' })
    );

    await waitFor(() => expect(onImageChange).toHaveBeenCalledTimes(1));
    const [file, url, credit] = onImageChange.mock.calls[0]!;
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('Waldlichtung');
    expect(url).toBe(SRC);
    expect(credit).toBeNull();
    // The canvas preview tier, not the multi-MB original.
    expect(fetchMock).toHaveBeenCalledWith(`/api/share/${TOKEN}/preview?w=2160&fmt=webp`);
    expect(upload).not.toHaveBeenCalled();
  });

  it('marks the gallery background in use', async () => {
    render(<ImageBackgroundSection currentImageSrc={SRC} onImageChange={() => {}} />);
    await openGallery();
    expect(
      screen.getByRole('button', { name: 'Waldlichtung als Hintergrund verwenden' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to own and remembered backgrounds', async () => {
    render(<ImageBackgroundSection onImageChange={() => {}} />);
    await openGallery();
    await userEvent.click(screen.getByRole('button', { name: 'Meine' }));
    expect(gallery.filters.at(-1)).toMatchObject({ kind: 'background', scope: 'mine' });
    expect(screen.getByText('Du hast noch keine eigenen Hintergründe.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gemerkt' }));
    expect(gallery.filters.at(-1)).toMatchObject({ kind: 'background', scope: 'saved' });
  });

  it('shows the gallery preview, not the full download, as the tile image', async () => {
    render(<ImageBackgroundSection onImageChange={() => {}} />);
    await openGallery();
    const tile = screen.getByRole('button', { name: 'Waldlichtung als Hintergrund verwenden' });
    expect(tile.querySelector('img')?.getAttribute('src')).toBe(
      `/api/share/${TOKEN}/preview?w=200&fmt=webp`
    );
  });

  it.skipIf(mobile)('lets a later "Bilder" pick win over a slow gallery pick', async () => {
    library.items = [libraryItem()];
    let finishGallery: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          finishGallery = r;
        })
    );
    const onImageChange = vi.fn();
    try {
      render(<ImageBackgroundSection onImageChange={onImageChange} />);
      await userEvent.click(
        screen.getByRole('button', { name: 'Waldlichtung als Hintergrund verwenden' })
      );
      await userEvent.click(screen.getByTitle('eigen.png'));
      await waitFor(() => expect(onImageChange).toHaveBeenCalledTimes(1));
      expect(onImageChange.mock.calls[0]![1]).toBe('/api/share/tok1/download');

      finishGallery({
        ok: true,
        blob: () => Promise.resolve(new Blob(['webp'], { type: 'image/webp' })),
      } as Response);
      await new Promise((r) => setTimeout(r, 0));
      expect(onImageChange).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', { name: 'Waldlichtung als Hintergrund verwenden' })
      ).toHaveAttribute('aria-busy', 'false');
    } finally {
      library.items = [];
    }
  });

  it('reports a failed load and leaves the background alone', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    const onImageChange = vi.fn();
    render(<ImageBackgroundSection onImageChange={onImageChange} />);
    await openGallery();
    await userEvent.click(
      screen.getByRole('button', { name: 'Waldlichtung als Hintergrund verwenden' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Hintergrund konnte nicht geladen werden.'
    );
    expect(onImageChange).not.toHaveBeenCalled();
  });
});
