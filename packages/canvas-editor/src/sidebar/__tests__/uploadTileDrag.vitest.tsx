import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { plainImageUrls, type CanvasImageUrlService } from '@ggraphic/editor/hostServices';
import { MEDIA_DRAG_TYPE } from '@ggraphic/editor/utils/mediaDrop';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { UploadsSection } from '@ggraphic/editor/sidebar/sections/UploadsSection';

/**
 * Eine Upload-Kachel lässt sich auf eine Seite ziehen (PageWrapper nimmt sie
 * an). Mitgegeben wird die dauerhafte URL, nie eine blob:-Vorschau.
 */

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
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
    // The host's thumbnail, handed through the uploads context.
    MediaThumb: ({ alt }: { alt: string }) => <img alt={alt} />,
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

/** A host that stores uploads as shares and places them from the share download link. */
const shareHost: CanvasImageUrlService = {
  ...plainImageUrls,
  placementUrl: (item) =>
    item.mediaUrl ||
    (item.shareToken ? `/api/share/${item.shareToken}/download` : item.thumbnailUrl),
};

describe('Upload-Kachel ziehen', () => {
  it('gibt die dauerhafte URL und den Dateinamen mit', () => {
    render(
      <CanvasEditorProvider services={{ imageUrls: shareHost }}>
        <UploadsSection onPlaceFromUrl={() => {}} />
      </CanvasEditorProvider>
    );
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
