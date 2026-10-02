/**
 * Die Chat-Vorschau darf erst fotografieren, wenn der Canvas seine Bilder hat.
 * Vorher nahm sie das erste Bild nach 500 ms — beim Dreizeiler war das
 * Stockbild dann noch unterwegs, und die Vorschau zeigte nur die grüne Fläche.
 */
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handle = vi.hoisted(() => ({
  settled: false,
  toDataURL: vi.fn(() => `data:image/png;base64,${'A'.repeat(200)}`),
}));

vi.mock('@gruenerator/canvas-editor', () => ({
  ensureFontsReady: () => Promise.resolve(),
  loadIconSetsFor: () => Promise.resolve(),
  StandaloneCanvas: ({ canvasRef }: { canvasRef: (ref: unknown) => void }) => {
    useEffect(() => {
      canvasRef({ toDataURL: handle.toDataURL, imagesSettled: () => handle.settled });
    }, [canvasRef]);
    return null;
  },
}));

import { renderSharepicToImage } from './renderSharepicToImage';

let seq = 0;
const render = () =>
  renderSharepicToImage('dreizeilen', { line1: `x${seq++}` }, { quality: 'preview' });

describe('renderSharepicToImage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handle.settled = false;
    handle.toDataURL.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the canvas images before capturing', async () => {
    const result = render();
    await vi.advanceTimersByTimeAsync(3000);
    expect(handle.toDataURL).not.toHaveBeenCalled();

    handle.settled = true;
    await vi.advanceTimersByTimeAsync(200);
    await expect(result).resolves.toMatch(/^data:image\/png/);
    expect(handle.toDataURL).toHaveBeenCalledTimes(1);
  });

  it('captures what it has at the deadline rather than giving up', async () => {
    const result = render();
    await vi.advanceTimersByTimeAsync(10_500);
    await expect(result).resolves.toMatch(/^data:image\/png/);
  });
});
