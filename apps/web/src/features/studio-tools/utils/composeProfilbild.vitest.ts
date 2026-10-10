import { describe, expect, it, vi } from 'vitest';

import { composeProfilbild } from './composeProfilbild';

function mockCanvas() {
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    fillStyle: '' as unknown,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx, gradient };
}

const portrait = { width: 600, height: 800 } as unknown as HTMLImageElement;

describe('composeProfilbild', () => {
  it('fills the colour and draws the person at 85 % anchored to the bottom', () => {
    const { canvas, ctx } = mockCanvas();
    composeProfilbild({
      cutout: portrait,
      background: { kind: 'color', color: '#005538' },
      canvas,
    });

    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
    expect(ctx.fillStyle).toBe('#005538');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1080);
    // 1080 * 0.85 = 918 tall, 918 * 0.75 = 688.5 → 689 wide
    expect(ctx.drawImage).toHaveBeenCalledWith(portrait, 196, 162, 689, 918);
  });

  it('scales landscape cut-outs by width and applies the vertical offset', () => {
    const { canvas, ctx } = mockCanvas();
    const landscape = { width: 1000, height: 500 } as unknown as HTMLImageElement;
    composeProfilbild({
      cutout: landscape,
      background: { kind: 'color', color: '#fff' },
      scale: 1,
      offsetY: -100,
      canvas,
    });
    expect(ctx.drawImage).toHaveBeenCalledWith(landscape, 0, 1080 - 540 - 100, 1080, 540);
  });

  it('cover-fits an image background', () => {
    const { canvas, ctx } = mockCanvas();
    const bg = { width: 2000, height: 1000 } as unknown as HTMLImageElement;
    composeProfilbild({ cutout: portrait, background: { kind: 'image', image: bg }, canvas });

    // scale = max(1080/2000, 1080/1000) = 1.08 → 2160×1080, centred horizontally
    expect(ctx.drawImage).toHaveBeenNthCalledWith(1, bg, -540, 0, 2160, 1080);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('creates a linear gradient along the angle with evenly spread stops', () => {
    const { canvas, ctx, gradient } = mockCanvas();
    composeProfilbild({
      cutout: portrait,
      background: { kind: 'gradient', stops: ['#005538', '#46962b'], angle: 180 },
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
