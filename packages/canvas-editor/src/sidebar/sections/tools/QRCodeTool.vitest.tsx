import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QRCodeTool } from '@ggraphic/editor/sidebar/sections/tools/QRCodeTool';

const finish = vi.fn(async (_file: File) => ({ itemName: 'qr', placedOnCanvas: true }));

vi.mock('@ggraphic/editor/sidebar/sections/tools/useToolImagePlacement', () => ({
  useToolImagePlacement: () => ({ finish, isUploading: false }),
}));

// Like the real QRCodeCanvas, the stand-in draws in a passive effect; the
// exported PNG carries whatever value the canvas last drew.
vi.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ value }: { value: string }) => {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
      const canvas = ref.current;
      if (!canvas) return;
      canvas.dataset.drawn = value;
      canvas.toBlob = (cb: BlobCallback) => cb(new Blob([value], { type: 'image/png' }));
    }, [value]);
    return <canvas ref={ref} data-testid="qr" />;
  },
}));

const typeInto = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: text } });

describe('QRCodeTool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    finish.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('redraws the preview only once typing pauses', () => {
    render(
      <CanvasEditorProvider services={{ qrPreviewUrl: 'https://gruenerator.eu' }}>
        <QRCodeTool />
      </CanvasEditorProvider>
    );
    const qr = screen.getByTestId('qr');

    typeInto('https://a');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    typeInto('https://ab');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(qr.dataset.drawn).toBe('https://gruenerator.eu');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(qr.dataset.drawn).toBe('https://ab');
  });

  it('inserts the current input even before the preview caught up', async () => {
    render(
      <CanvasEditorProvider services={{ qrPreviewUrl: 'https://gruenerator.eu' }}>
        <QRCodeTool />
      </CanvasEditorProvider>
    );
    typeInto('https://gruene.de');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /QR-Code/ }));
    });

    expect(finish).toHaveBeenCalledOnce();
    expect(await finish.mock.calls[0][0].text()).toBe('https://gruene.de');
  });
});
