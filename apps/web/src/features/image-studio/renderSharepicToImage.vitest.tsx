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

const mounts = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
const compose = vi.hoisted(() => ({ fn: vi.fn() }));
const failing = vi.hoisted(() => ({ before: false }));
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('@sentry/react', () => ({ captureException: sentry.captureException }));

vi.mock('./freitext/composeForRender', () => ({ composeCreatorSharepic: compose.fn }));

vi.mock('@gruenerator/canvas-editor', () => ({
  ensureFontsReady: () => Promise.resolve(),
  loadIconSetsFor: () => Promise.resolve(),
  catalogIconId: (id: string) => {
    if (failing.before) throw new Error('icon set unavailable');
    return id;
  },
  StandaloneCanvas: (props: { canvasRef: (ref: unknown) => void }) => {
    const { canvasRef } = props;
    mounts.props.push(props as unknown as Record<string, unknown>);
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
    mounts.props.length = 0;
    compose.fn.mockReset();
    failing.before = false;
    sentry.captureException.mockClear();
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

  // What a phone showed as "timeout" twice: a throw before the canvas mounts
  // (module or icons) left the promise open for good, and every later render
  // in the page queued behind it.
  it('gives up at once when the steps before the canvas fail, and keeps the queue moving', async () => {
    failing.before = true;
    const broken = renderSharepicToImage('dreizeilen', {
      line1: `x${seq++}`,
      iconStates: { a: { iconId: 'x' } },
    });
    await vi.advanceTimersByTimeAsync(0);
    await expect(broken).resolves.toBeNull();
    expect(sentry.captureException).toHaveBeenCalledOnce();

    failing.before = false;
    handle.settled = true;
    const next = render();
    await vi.advanceTimersByTimeAsync(700);
    await expect(next).resolves.toMatch(/^data:image\/png/);
  });

  // The hidden Android WebView loses the photo from a capture above 1x, so the
  // app's render page must not inherit the export default of 2x.
  it.each([
    ['preview', 0.7],
    ['app', 1],
    ['full', 2],
  ] as const)('captures %s quality at pixelRatio %s', async (quality, pixelRatio) => {
    handle.settled = true;
    const result = renderSharepicToImage('dreizeilen', { line1: `x${seq++}` }, { quality });
    await vi.advanceTimersByTimeAsync(700);
    await expect(result).resolves.toMatch(/^data:image\/png/);
    expect(handle.toDataURL).toHaveBeenLastCalledWith({ pixelRatio });
  });

  it('captures what it has at the deadline rather than giving up', async () => {
    const result = render();
    await vi.advanceTimersByTimeAsync(10_500);
    await expect(result).resolves.toMatch(/^data:image\/png/);
  });

  it('composes creator props and renders the requested slide with its format', async () => {
    const s0 = { marker: 's0' };
    const s1 = { marker: 's1' };
    compose.fn.mockResolvedValue({
      templateType: 'freeform',
      format: 'post-portrait-tall',
      slides: [s0, s1],
    });
    handle.settled = true;
    const creatorSpec = {
      locale: 'de-DE',
      slides: [
        {
          background: { kind: 'farbe', color: 'tanne' },
          position: 'mitte',
          align: 'links',
          items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
          logo: false,
        },
      ],
    };
    const result = renderSharepicToImage(
      'freeform',
      { creatorSpec, attributions: [null, null], slide: 1 },
      { quality: 'preview' }
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toMatch(/^data:image\/png/);
    expect(mounts.props).toHaveLength(1);
    expect(mounts.props[0]).toMatchObject({
      configId: 'freeform',
      formatId: 'post-portrait-tall',
      initialProps: s1,
    });
  });

  it('resolves null for an unparseable creator spec without rendering', async () => {
    const result = await renderSharepicToImage('freeform', {
      creatorSpec: { locale: 'de-DE', slides: [] },
      attributions: [],
    });
    expect(result).toBeNull();
    expect(compose.fn).not.toHaveBeenCalled();
    expect(mounts.props).toHaveLength(0);
  });
});
