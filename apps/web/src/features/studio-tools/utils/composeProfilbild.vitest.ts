import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  alphaBounds,
  composeProfilbild,
  defaultPlacement,
  placementRect,
  rescalePlacement,
  TRIM_MAX_EDGE,
  trimCutout,
} from './composeProfilbild';

function mockCanvas() {
  const gradient = { addColorStop: vi.fn() };
  const calls: string[] = [];
  const ctx = {
    fillStyle: '' as unknown,
    globalAlpha: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn(() => calls.push('fillRect')),
    drawImage: vi.fn((img: { id?: string }) => calls.push(`draw:${img.id ?? '?'}`)),
    createLinearGradient: vi.fn(() => gradient),
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    translate: vi.fn((x: number, y: number) => calls.push(`translate:${x},${y}`)),
    rotate: vi.fn((r: number) => calls.push(`rotate:${r.toFixed(4)}`)),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, gradient, calls };
}

const portrait = { width: 600, height: 800 } as unknown as HTMLImageElement;

describe('composeProfilbild', () => {
  it('fills the colour and draws the person at 85 % anchored to the bottom', () => {
    const { canvas, ctx } = mockCanvas();
    composeProfilbild({
      cutout: portrait,
      background: { kind: 'color', color: '#005538' },
      position: { x: 196, y: 162 },
      canvas,
    });

    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
    expect(ctx.fillStyle).toBe('#005538');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1080);
    // 1080 * 0.85 = 918 tall, 918 * 0.75 = 688.5 → 689 wide
    expect(ctx.drawImage).toHaveBeenCalledWith(portrait, 196, 162, 689, 918);
  });

  it('scales landscape cut-outs by width', () => {
    const { canvas, ctx } = mockCanvas();
    const landscape = { width: 1000, height: 500 } as unknown as HTMLImageElement;
    composeProfilbild({
      cutout: landscape,
      background: { kind: 'color', color: '#fff' },
      scale: 1,
      position: { x: 0, y: 440 },
      canvas,
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(landscape, 0, 440, 1080, 540);
  });

  it('draws the person at an explicit position', () => {
    const { canvas, ctx } = mockCanvas();
    composeProfilbild({
      cutout: portrait,
      background: { kind: 'color', color: '#fff' },
      scale: 0.85,
      position: { x: 40.5, y: 120 },
      canvas,
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(portrait, 40.5, 120, 689, 918);
  });

  it('draws stripes as full-width vector bands that tile the canvas exactly', () => {
    const { canvas, ctx } = mockCanvas();
    const fills: unknown[] = [];
    ctx.fillRect.mockImplementation(() => fills.push(ctx.fillStyle) as never);
    composeProfilbild({
      cutout: portrait,
      background: { kind: 'stripes', colors: ['#a', '#b', '#c', '#d', '#e', '#f', '#g'] },
      position: { x: 196, y: 162 },
      canvas,
    });
    const rects = ctx.fillRect.mock.calls as unknown as number[][];
    expect(fills).toEqual(['#a', '#b', '#c', '#d', '#e', '#f', '#g']);
    expect(rects[0]).toEqual([0, 0, 1080, 154]);
    expect(rects.reduce((sum, r) => sum + (r[3] ?? 0), 0)).toBe(1080);
    rects
      .slice(1)
      .forEach((r, i) => expect(r[1]).toBe((rects[i]?.[1] ?? 0) + (rects[i]?.[3] ?? 0)));
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('cover-fits an image background', () => {
    const { canvas, ctx } = mockCanvas();
    const bg = { width: 2000, height: 1000 } as unknown as HTMLImageElement;
    composeProfilbild({
      cutout: portrait,
      background: { kind: 'image', image: bg },
      position: { x: 196, y: 162 },
      canvas,
    });

    // scale = max(1080/2000, 1080/1000) = 1.08 → 2160×1080, centred horizontally
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, bg, -540, 0, 2160, 1080);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('creates a linear gradient along the angle with evenly spread stops', () => {
    const { canvas, ctx, gradient } = mockCanvas();
    composeProfilbild({
      cutout: portrait,
      background: { kind: 'gradient', stops: ['#005538', '#46962b'], angle: 180 },
      position: { x: 196, y: 162 },
      canvas,
    });

    const [x0, y0, x1, y1] = ctx.createLinearGradient.mock.calls[0] as unknown as number[];
    expect(x0).toBeCloseTo(540);
    expect(y0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(540);
    expect(y1).toBeCloseTo(1080);
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, '#005538');
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, '#46962b');
    expect(ctx.fillStyle).toBe(gradient);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1080);
  });
});

describe('composeProfilbild – Vorlagen und Sticker', () => {
  it('draws a preset base and its overlay centred at the given fractions with opacity', () => {
    const { canvas, ctx, calls } = mockCanvas();
    const flower = { id: 'flower', width: 500, height: 250 } as unknown as HTMLImageElement;
    let alphaAtDraw = 1;
    ctx.drawImage.mockImplementation((img: { id?: string }) => {
      if (img.id === 'flower') alphaAtDraw = ctx.globalAlpha;
      return calls.push(`draw:${img.id ?? '?'}`);
    });
    composeProfilbild({
      cutout: { id: 'person', width: 600, height: 800 } as unknown as HTMLImageElement,
      background: {
        kind: 'preset',
        base: { kind: 'color', color: '#005538' },
        overlays: [{ image: flower, x: 0.75, y: 0.25, width: 0.5, opacity: 0.2 }],
      },
      position: { x: 196, y: 162 },
      canvas,
    });
    // 0.5 × 1080 = 540 wide, 270 tall, centred on (810, 270)
    expect(ctx.drawImage).toHaveBeenCalledWith(flower, 540, 135, 540, 270);
    expect(alphaAtDraw).toBe(0.2);
    expect(calls.slice(0, 3)).toEqual(['fillRect', 'save', 'draw:flower']);
    expect(calls.indexOf('draw:person')).toBeGreaterThan(calls.indexOf('draw:flower'));
  });

  it('draws stickers after the person, rotated around their centre', () => {
    const { canvas, ctx, calls } = mockCanvas();
    const person = { id: 'person', width: 600, height: 800 } as unknown as HTMLImageElement;
    const sticker = { id: 'sticker', width: 200, height: 100 } as unknown as HTMLImageElement;
    composeProfilbild({
      cutout: person,
      background: { kind: 'color', color: '#fff' },
      position: { x: 196, y: 162 },
      stickers: [{ image: sticker, x: 300, y: 200, width: 270, height: 135, rotation: 90 }],
      canvas,
    });
    expect(ctx.translate).toHaveBeenCalledWith(300, 200);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(ctx.drawImage).toHaveBeenLastCalledWith(sticker, -135, -67.5, 270, 135);
    expect(calls).toEqual([
      'fillRect',
      'draw:person',
      'save',
      'translate:300,200',
      'rotate:1.5708',
      'draw:sticker',
      'restore',
    ]);
  });
});

describe('placement', () => {
  it('defaults to centred and bottom-anchored', () => {
    expect(defaultPlacement(portrait)).toEqual({ x: 196, y: 162, scale: 0.85 });
    expect(placementRect(portrait, { x: 10, y: 20, scale: 0.85 })).toEqual({
      x: 10,
      y: 20,
      width: 689,
      height: 918,
    });
  });

  it('rescales around the horizontal centre and the bottom edge', () => {
    const before = placementRect(portrait, { x: 100, y: 50, scale: 0.85 });
    const next = rescalePlacement(portrait, { x: 100, y: 50, scale: 0.85 }, 1);
    const after = placementRect(portrait, next);
    expect(after.height).toBe(1080);
    expect(after.y + after.height).toBe(before.y + before.height);
    expect(Math.abs(after.x + after.width / 2 - (before.x + before.width / 2))).toBeLessThanOrEqual(
      0.5
    );
  });
});

function rgba(w: number, h: number, pixels: [number, number, number][]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x, y, a] of pixels) data[(y * w + x) * 4 + 3] = a;
  return data;
}

describe('alphaBounds', () => {
  it('returns null for a fully transparent image', () => {
    expect(alphaBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });

  it('ignores near-transparent noise below the threshold', () => {
    expect(alphaBounds(rgba(4, 4, [[1, 1, 8]]), 4, 4)).toBeNull();
  });

  it('finds a single pixel', () => {
    expect(alphaBounds(rgba(5, 4, [[3, 2, 255]]), 5, 4)).toEqual({
      x: 3,
      y: 2,
      width: 1,
      height: 1,
    });
  });

  it('finds the box around opaque pixels', () => {
    const px: [number, number, number][] = [
      [2, 1, 255],
      [6, 1, 200],
      [4, 5, 255],
      [0, 0, 3],
    ];
    expect(alphaBounds(rgba(8, 8, px), 8, 8)).toEqual({ x: 2, y: 1, width: 5, height: 5 });
  });
});

describe('trimCutout', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubCanvases(alpha: (x: number, y: number, w: number) => number) {
    const canvases: {
      width: number;
      height: number;
      drawImage: ReturnType<typeof vi.fn>;
      toDataURL: ReturnType<typeof vi.fn>;
    }[] = [];
    const createElement = vi.fn((tag: string) => {
      if (tag !== 'canvas') throw new Error(tag);
      const drawImage = vi.fn();
      const canvas = {
        width: 0,
        height: 0,
        drawImage,
        toDataURL: vi.fn(() => 'data:image/png;base64,OUT'),
        getContext: () => ({
          drawImage,
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            const data = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = alpha(x, y, w);
            return { data };
          },
        }),
      };
      canvases.push(canvas);
      return canvas;
    });
    vi.stubGlobal('document', { createElement });
    return { canvases };
  }

  it('caps the long edge and outputs the trimmed image at that scale', () => {
    const big = { naturalWidth: 4320, naturalHeight: 2160, width: 4320, height: 2160 };
    const { canvases } = stubCanvases((x, y) =>
      x >= 100 && x < 600 && y >= 50 && y < 450 ? 255 : 0
    );
    const result = trimCutout(big as unknown as HTMLImageElement);

    const [scan, out] = canvases;
    expect(TRIM_MAX_EDGE).toBe(2160);
    expect([scan?.width, scan?.height]).toEqual([2160, 1080]);
    expect(scan?.drawImage).toHaveBeenCalledWith(big, 0, 0, 2160, 1080);
    expect([out?.width, out?.height]).toEqual([500, 400]);
    expect(result.image).toBe(out);
    expect(result.dataUrl).toBe('data:image/png;base64,OUT');
  });

  it('returns the input untouched when small and nothing is transparent', () => {
    const img = { naturalWidth: 10, naturalHeight: 10, width: 10, height: 10 };
    stubCanvases(() => 255);
    const result = trimCutout(img as unknown as HTMLImageElement);
    expect(result).toEqual({ image: img, dataUrl: null });
  });

  it('warns and falls back to the input when the canvas throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('boom');
      },
    });
    const img = { naturalWidth: 10, naturalHeight: 10, width: 10, height: 10 };
    const result = trimCutout(img as unknown as HTMLImageElement);
    expect(result.dataUrl).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
