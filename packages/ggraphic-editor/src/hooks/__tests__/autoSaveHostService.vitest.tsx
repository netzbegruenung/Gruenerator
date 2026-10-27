// SPDX-License-Identifier: MPL-2.0
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import { useCanvasAutoSave } from '@ggraphic/editor/hooks/useCanvasAutoSave';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import type { ReactNode } from 'react';

/**
 * Autosave writes through the host's `imageShares` service (the app passes
 * its share store). Without the service the editor does
 * not autosave, and nothing throws.
 */

const IMAGE = 'blob:fixture-image';

function wrapperFor(services: CanvasEditorServices) {
  return ({ children }: { children: ReactNode }) => (
    <CanvasEditorProvider services={services}>
      <AutoSaveStoreProvider>{children}</AutoSaveStoreProvider>
    </CanvasEditorProvider>
  );
}

describe('useCanvasAutoSave and the host share service', () => {
  it('creates the draft share through the injected service and reports its token', async () => {
    const createImageShare = vi.fn(async () => ({ shareToken: 'tok-1' }));
    const updateImageShare = vi.fn(async () => ({ shareToken: 'tok-1' }));
    const onShareToken = vi.fn();
    const { result } = renderHook(
      () => useCanvasAutoSave(IMAGE, { canvasType: 'zitat', canvasState: {}, onShareToken }),
      {
        wrapper: wrapperFor({
          imageShares: { createImageShare, updateImageShare, publishShare: vi.fn() },
        }),
      }
    );

    await act(() => result.current.retry());

    expect(createImageShare).toHaveBeenCalledTimes(1);
    expect(createImageShare).toHaveBeenCalledWith(
      expect.objectContaining({
        imageData: IMAGE,
        imageType: 'zitat',
        contentOrigin: 'sharepic',
        status: 'draft',
      })
    );
    expect(updateImageShare).not.toHaveBeenCalled();
    expect(onShareToken).toHaveBeenCalledWith('tok-1');
  });

  it('does not save without the service', async () => {
    const onShareToken = vi.fn();
    const { result } = renderHook(
      () => useCanvasAutoSave(IMAGE, { canvasType: 'zitat', canvasState: {}, onShareToken }),
      { wrapper: wrapperFor({}) }
    );

    await act(() => result.current.retry());

    expect(onShareToken).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
