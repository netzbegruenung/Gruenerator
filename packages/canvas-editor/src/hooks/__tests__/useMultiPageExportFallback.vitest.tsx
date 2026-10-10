import type * as SharedModule from '@gruenerator/shared';

import { NativeDownloadTooLargeError } from '@gruenerator/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadBlob = vi.fn();
const downloadDataUrl = vi.fn();

vi.mock('@gruenerator/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    downloadBlob: (...a: unknown[]): unknown => downloadBlob(...a),
    downloadDataUrl: (...a: unknown[]): unknown => downloadDataUrl(...a),
  };
});
vi.mock('../../CanvasEditorProvider', () => ({
  useCanvasEditorServices: () => ({ apiBaseUrl: '' }),
}));

import { useMultiPageExport } from '../useMultiPageExport';

const refs = ['data:image/png;base64,AA', 'data:image/png;base64,BB'].map((d) => ({
  current: { captureCanvas: async () => d },
})) as never;

describe('useMultiPageExport too-large ZIP', () => {
  beforeEach(() => {
    downloadBlob.mockReset();
    downloadDataUrl.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['zip']) })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends the pages individually when the ZIP is refused', async () => {
    downloadBlob.mockRejectedValue(new NativeDownloadTooLargeError());
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }));
    await act(() => result.current.downloadAllAsZip());

    expect(downloadDataUrl).toHaveBeenCalledTimes(2);
    expect(downloadDataUrl).toHaveBeenNthCalledWith(
      1,
      'data:image/png;base64,AA',
      'gruenerator-x-seite-1.png'
    );
    expect(result.current.error).toBeNull();
    expect(result.current.notice).toBe('Die Seiten wurden einzeln gesendet.');
  });

  it('clears the notice after a few seconds', async () => {
    downloadBlob.mockRejectedValue(new NativeDownloadTooLargeError());
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }));
    await act(() => result.current.downloadAllAsZip());
    expect(result.current.notice).not.toBeNull();
    await waitFor(() => expect(result.current.notice).toBeNull(), { timeout: 6000 });
  }, 10000);

  it('reports which pages were sent when a page fails mid-way', async () => {
    downloadBlob.mockRejectedValue(new NativeDownloadTooLargeError());
    downloadDataUrl
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NativeDownloadTooLargeError());
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }));
    await act(() => result.current.downloadAllAsZip());

    expect(result.current.notice).toBe('Seite 1 wurde einzeln gesendet, Seite 2 nicht.');
    expect(result.current.error).toContain('zu groß');
  });

  it('recognises the error by name across duplicated bundles', async () => {
    const foreign = Object.assign(new Error('x'), { name: 'NativeDownloadTooLargeError' });
    downloadBlob.mockRejectedValue(foreign);
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }));
    await act(() => result.current.downloadAllAsZip());
    expect(downloadDataUrl).toHaveBeenCalledTimes(2);
  });

  it('still reports other download errors', async () => {
    downloadBlob.mockRejectedValue(new Error('kaputt'));
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }));
    await act(() => result.current.downloadAllAsZip());

    expect(downloadDataUrl).not.toHaveBeenCalled();
    expect(result.current.error).toBe('kaputt');
  });
});
