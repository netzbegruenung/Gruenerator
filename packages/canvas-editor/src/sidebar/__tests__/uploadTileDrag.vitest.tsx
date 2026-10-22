import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MEDIA_DRAG_TYPE } from '../../utils/mediaDrop';
import { UploadsSection } from '../sections/UploadsSection';

/**
 * Eine Upload-Kachel lässt sich auf eine Seite ziehen (PageWrapper nimmt sie
 * an). Mitgegeben wird die dauerhafte URL, nie eine blob:-Vorschau.
 */

vi.mock('@gruenerator/shared/media-library/ui', () => ({
  MediaThumb: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('../UserUploadsProvider', () => ({
  useUserUploads: () => ({
    items: [
      {
        id: 'm1',
        shareToken: 'tok',
        mediaType: 'image',
        title: 'Wiese',
        thumbnailUrl: '/api/share/tok/preview',
        mimeType: 'image/jpeg',
        originalFilename: 'wiese.jpg',
        altText: 'Wiese',
      },
    ],
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload: async () => null,
    deleteFromLibrary: async () => {},
    uploadError: null,
    hasMore: false,
    loadMore: async () => {},
  }),
}));

// Desktop-Raster.
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
);

describe('Upload-Kachel ziehen', () => {
  it('gibt die dauerhafte URL und den Dateinamen mit', () => {
    render(<UploadsSection onPlaceFromUrl={() => {}} />);
    const tile = screen.getByTitle('Wiese');
    expect(tile).toHaveAttribute('draggable', 'true');

    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (type: string, value: string) => {
        data[type] = value;
      },
      effectAllowed: 'none',
    };
    fireEvent.dragStart(tile, { dataTransfer });

    expect(JSON.parse(data[MEDIA_DRAG_TYPE]!)).toEqual({
      url: '/api/share/tok/download',
      name: 'wiese.jpg',
    });
    expect(dataTransfer.effectAllowed).toBe('copy');
  });
});
