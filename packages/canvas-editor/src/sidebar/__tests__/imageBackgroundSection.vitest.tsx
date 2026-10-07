import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageBackgroundSection } from '../sections/ImageBackgroundSection';

import type { MediaItem } from '@gruenerator/shared/media-library';

const upload = vi.fn<(file: File) => Promise<MediaItem | null>>();

vi.mock('../UserUploadsProvider', () => ({
  useUserUploads: () => ({
    items: [],
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

    await userEvent.click(within(tile).getByRole('button', { name: 'Hintergrund entfernen' }));
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
