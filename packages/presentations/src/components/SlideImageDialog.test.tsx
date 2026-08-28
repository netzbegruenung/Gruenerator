import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SlideImageDialog } from './SlideImageDialog.js';

const items = [
  {
    id: 'm1',
    shareToken: 'tok1',
    mediaType: 'image',
    title: 'Windrad',
    thumbnailUrl: '/thumb/1.webp',
    mediaUrl: 'https://media.test/windrad.png',
    altText: 'Ein Windrad im Feld',
    originalFilename: 'windrad.png',
  },
  {
    id: 'm2',
    shareToken: 'tok2',
    mediaType: 'image',
    title: null,
    thumbnailUrl: null,
    altText: null,
    originalFilename: 'ohne-alt.png',
  },
];

const setFilters = vi.fn();
const upload = vi.fn();

// Only the two data hooks are stubbed — `buildSharedMediaSrcSet` stays real, so
// the "tiles never request the original" assertion below tests the actual URLs.
vi.mock('@gruenerator/shared/media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gruenerator/shared/media-library')>()),
  useMediaLibrary: () => ({ items, isLoading: false, error: null, setFilters }),
  useMediaUpload: () => ({ upload, isUploading: false, error: null }),
}));

beforeEach(() => {
  setFilters.mockClear();
  upload.mockClear();
});

function open() {
  const onInsert = vi.fn();
  const onClose = vi.fn();
  const view = render(<SlideImageDialog onInsert={onInsert} onClose={onClose} />);
  return { onInsert, onClose, view };
}

describe('SlideImageDialog', () => {
  it('keeps insertion locked until both an image and an alt text exist', () => {
    open();
    const insert = screen.getByRole('button', { name: 'Einfügen' });
    expect(insert).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Bildadresse/), {
      target: { value: 'https://media.test/x.png' },
    });
    expect(insert).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Alternativtext/), { target: { value: 'Ein Bild' } });
    expect(insert).toBeEnabled();
  });

  it('takes the URL and the stored alt text from a library pick', () => {
    const { onInsert } = open();
    fireEvent.click(screen.getByAltText('Ein Windrad im Feld'));

    expect(screen.getByLabelText(/Bildadresse/)).toHaveValue('https://media.test/windrad.png');
    expect(screen.getByLabelText(/Alternativtext/)).toHaveValue('Ein Windrad im Feld');

    fireEvent.click(screen.getByRole('button', { name: 'Einfügen' }));
    expect(onInsert).toHaveBeenCalledWith({
      src: 'https://media.test/windrad.png',
      alt: 'Ein Windrad im Feld',
    });
  });

  it('still demands an alt text for a library image that has none', () => {
    open();
    fireEvent.click(screen.getByAltText('ohne-alt.png'));

    expect(screen.getByLabelText(/Bildadresse/)).toHaveValue('/api/share/tok2/preview');
    expect(screen.getByRole('button', { name: 'Einfügen' })).toBeDisabled();
  });

  it('absolutises a relative URL — the PPTX export fetches it server-side', () => {
    const { onInsert } = open();
    fireEvent.click(screen.getByAltText('ohne-alt.png'));
    fireEvent.change(screen.getByLabelText(/Alternativtext/), { target: { value: 'Ohne Alt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einfügen' }));

    expect(onInsert).toHaveBeenCalledWith({
      src: `${window.location.origin}/api/share/tok2/preview`,
      alt: 'Ohne Alt',
    });
  });

  // `thumbnailUrl` is `/preview` with no `w`, which the API answers with the
  // unresized original — a multi-megabyte upload in a 120px tile. The grid must
  // therefore ask for a variant, while the *inserted* image stays full-size.
  it('requests sized variants for the grid tiles, never the original', () => {
    open();
    const tile = screen.getByAltText('Ein Windrad im Feld');

    expect(tile.getAttribute('src')).toBe('/api/share/tok1/preview?w=400&fmt=webp');

    const srcSets = Array.from(
      tile.closest('picture')?.querySelectorAll('source') ?? [],
      (source) => source.getAttribute('srcSet') ?? ''
    );
    expect(srcSets).toHaveLength(2);
    for (const srcSet of srcSets) {
      expect(srcSet).toMatch(/[?&]w=200&/);
      for (const entry of srcSet.split(',')) {
        expect(entry).toContain('w=');
      }
    }
  });

  it('has no accessibility violations', async () => {
    const { view } = open();
    const result = await axe(view.container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result).toHaveNoViolations();
  });
});
