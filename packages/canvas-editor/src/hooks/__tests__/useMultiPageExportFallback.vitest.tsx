import { NativeDownloadTooLargeError } from '@gruenerator/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '../../CanvasEditorProvider';
import { useMultiPageExport } from '../useMultiPageExport';

import type { ReactNode } from 'react';

const downloadBlob = vi.fn();
const downloadDataUrl = vi.fn();

// The host's file delivery, injected the way apps/web does it.
const wrapper = ({ children }: { children: ReactNode }) => (
  <CanvasEditorProvider
    services={{
      fileDelivery: {
        downloadBlob: (blob, name) => downloadBlob(blob, name) as Promise<void>,
        downloadDataUrl: (url, name) => downloadDataUrl(url, name) as Promise<void>,
        pickShareRoute: () => null,
        shareDataUrlViaNativeHost: vi.fn(),
      },
    }}
  >
    {children}
  </CanvasEditorProvider>
);

const refs = ['data:image/png;base64,AA', 'data:image/png;base64,BB'].map((d) => ({
  current: { captureCanvas: async () => d },
})) as never;

describe('useMultiPageExport too-large ZIP', () => {
  beforeEach(() => {
    downloadBlob.mockReset();
    downloadDataUrl.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends the pages individually when the ZIP is refused', async () => {
    downloadBlob.mockRejectedValue(new NativeDownloadTooLargeError());
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }), {
      wrapper,
    });
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
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }), {
      wrapper,
    });
    await act(() => result.current.downloadAllAsZip());
    expect(result.current.notice).not.toBeNull();
    await waitFor(() => expect(result.current.notice).toBeNull(), { timeout: 6000 });
  }, 10000);

  it('reports which pages were sent when a page fails mid-way', async () => {
    downloadBlob.mockRejectedValue(new NativeDownloadTooLargeError());
    downloadDataUrl
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NativeDownloadTooLargeError());
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }), {
      wrapper,
    });
    await act(() => result.current.downloadAllAsZip());

    expect(result.current.notice).toBe('Seite 1 wurde einzeln gesendet, Seite 2 nicht.');
    expect(result.current.error).toContain('zu groß');
  });

  it('recognises the error by name across duplicated bundles', async () => {
    const foreign = Object.assign(new Error('x'), { name: 'NativeDownloadTooLargeError' });
    downloadBlob.mockRejectedValue(foreign);
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }), {
      wrapper,
    });
    await act(() => result.current.downloadAllAsZip());
    expect(downloadDataUrl).toHaveBeenCalledTimes(2);
  });

  it('still reports other download errors', async () => {
    downloadBlob.mockRejectedValue(new Error('kaputt'));
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }), {
      wrapper,
    });
    await act(() => result.current.downloadAllAsZip());

    expect(downloadDataUrl).not.toHaveBeenCalled();
    expect(result.current.error).toBe('kaputt');
  });
});

describe('useMultiPageExport client-side ZIP', () => {
  it('packs the pages in the browser without a network call', async () => {
    downloadBlob.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useMultiPageExport({ canvasRefs: refs, canvasType: 'x' }), {
      wrapper,
    });
    await act(() => result.current.downloadAllAsZip());

    expect(fetch).not.toHaveBeenCalled();
    const [blob, name] = downloadBlob.mock.calls[0] as [Blob, string];
    expect(name).toMatch(/^gruenerator-x-.*\.zip$/);
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(['seite-1.png', 'seite-2.png']);
    expect(result.current.error).toBeNull();
  });
});

describe('useMultiPageExport format', () => {
  it('captures and names the pages in the chosen format', async () => {
    downloadBlob.mockReset().mockRejectedValue(new NativeDownloadTooLargeError());
    downloadDataUrl.mockReset().mockResolvedValue(undefined);
    const captureCanvas = vi.fn(async () => 'data:image/jpeg;base64,AA');
    const jpegRefs = [{ current: { captureCanvas } }, { current: { captureCanvas } }] as never;
    const { result } = renderHook(
      () => useMultiPageExport({ canvasRefs: jpegRefs, canvasType: 'x' }),
      { wrapper }
    );
    await act(() => result.current.downloadAllAsZip('jpeg'));

    expect(captureCanvas).toHaveBeenCalledWith({ format: 'jpeg' });
    expect(downloadDataUrl).toHaveBeenNthCalledWith(
      1,
      'data:image/jpeg;base64,AA',
      'gruenerator-x-seite-1.jpg'
    );
  });
});
