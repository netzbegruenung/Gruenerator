// SPDX-License-Identifier: MPL-2.0
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import {
  plainImageUrls,
  type CanvasMediaItem,
  type CanvasMediaUploadResult,
} from '@ggraphic/editor/hostServices';
import { UploadsSection } from '@ggraphic/editor/sidebar/sections/UploadsSection';
import { UserUploadsProvider, useUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';

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

/**
 * Ein Host, dessen Upload eine direkte Bild-URL liefert (Studio: `{ url }`),
 * muss sie nicht in `shareToken` schmuggeln: sie wird zur Platzierungsquelle.
 */

function servicesFor(
  result: CanvasMediaUploadResult,
  libraryItems: CanvasMediaItem[] = []
): CanvasEditorServices {
  return {
    mediaLibrary: {
      useMediaLibrary: () => ({
        items: libraryItems,
        isLoading: false,
        error: null,
        pagination: { hasMore: false },
        loadMore: async () => {},
        setFilters: () => {},
        deleteItem: async () => true,
      }),
      useMediaUpload: () => ({
        upload: async () => result,
        isUploading: false,
        progress: 0,
        error: null,
      }),
      MediaThumb: () => null,
    },
  };
}

async function uploadWith(result: CanvasMediaUploadResult): Promise<CanvasMediaItem> {
  const box: { upload: ReturnType<typeof useUserUploads>['upload'] | null } = { upload: null };
  function Probe() {
    box.upload = useUserUploads().upload;
    return null;
  }
  render(
    <CanvasEditorProvider services={servicesFor(result)}>
      <UserUploadsProvider>
        <Probe />
      </UserUploadsProvider>
    </CanvasEditorProvider>
  );
  let item: CanvasMediaItem | null = null;
  await act(async () => {
    item = await box.upload!(new File(['x'], 'a.png', { type: 'image/png' }));
  });
  if (!item) throw new Error('upload returned no item');
  return item;
}

describe('Upload-Ergebnis behält seine URL', () => {
  it('nutzt die URL des Hosts als Platzierungsquelle, ohne Share-Token', async () => {
    const item = await uploadWith({ id: 'u1', url: 'https://cdn.test/u1.png' });
    expect(plainImageUrls.placementUrl(item)).toBe('https://cdn.test/u1.png');
    expect(item.mediaUrl).toBe('https://cdn.test/u1.png');
    expect(item.shareToken).toBe('');
  });

  it('zeigt ein Upload nur mit URL als Bild in der Kachel', async () => {
    const result = { id: 'u3', url: 'https://cdn.test/u3.png' };
    const item = await uploadWith(result);
    const { container } = render(
      <CanvasEditorProvider services={servicesFor(result, [item])}>
        <UserUploadsProvider>
          <UploadsSection />
        </UserUploadsProvider>
      </CanvasEditorProvider>
    );
    expect(container.querySelector(`img[src="${result.url}"]`)).not.toBeNull();
  });

  it('lässt Ergebnisse (Share-Token, keine URL) unverändert', async () => {
    const item = await uploadWith({ id: 'u2', shareToken: 'tok' });
    expect(item.shareToken).toBe('tok');
    expect(item.mediaUrl).toBeUndefined();
  });
});

describe('Upload-Ergebnis braucht einen Link', () => {
  it('verlangt shareToken oder url', () => {
    const ok: CanvasMediaUploadResult[] = [
      { id: 'a', shareToken: 't' },
      { id: 'b', url: 'https://x/y.png' },
    ];
    // @ts-expect-error weder shareToken noch url
    const bad: CanvasMediaUploadResult = { id: 'x' };
    expect(ok).toHaveLength(2);
    expect(bad.id).toBe('x');
  });
});
