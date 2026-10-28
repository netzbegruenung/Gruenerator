// SPDX-License-Identifier: MPL-2.0
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import {
  plainImageUrls,
  type CanvasMediaItem,
  type CanvasMediaUploadResult,
} from '@ggraphic/editor/hostServices';
import { UserUploadsProvider, useUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';

/**
 * Ein Host, dessen Upload eine direkte Bild-URL liefert (Studio: `{ url }`),
 * muss sie nicht in `shareToken` schmuggeln: sie wird zur Platzierungsquelle.
 */

function servicesFor(result: CanvasMediaUploadResult): CanvasEditorServices {
  return {
    mediaLibrary: {
      useMediaLibrary: () => ({
        items: [],
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
  });

  it('lässt Ergebnisse (Share-Token, keine URL) unverändert', async () => {
    const item = await uploadWith({ id: 'u2', shareToken: 'tok' });
    expect(item.shareToken).toBe('tok');
    expect(item.mediaUrl).toBeUndefined();
  });
});
