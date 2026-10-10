/**
 * Word-wrap loops measure per word candidate. A fresh <canvas> + 2D context
 * per call made each keystroke allocate hundreds of them; the measurement now
 * shares one lazily created context. jsdom has no real 2D context (getContext
 * may return null → estimate fallback) — the canvas must still be created at
 * most once. Lives in the jsdom lane (`.vitest.tsx`) because it needs
 * `document` and resets modules, which the shared node fork forbids.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('measureTextWidthWithFont', () => {
  afterEach(() => vi.restoreAllMocks());

  // Der frische Import von @gruenerator/contracts braucht kalt ein paar Sekunden.
  it('legt über viele Messungen höchstens ein <canvas> an', async () => {
    vi.resetModules();
    const { measureTextWidthWithFont } = await import('../textUtils');
    const createElement = vi.spyOn(document, 'createElement');

    for (let i = 0; i < 200; i++) {
      const width = measureTextWidthWithFont(`Wort ${i}`, 40, 'PT Sans', 'bold');
      expect(Number.isFinite(width)).toBe(true);
    }

    const canvases = createElement.mock.calls.filter(([tag]) => tag === 'canvas');
    expect(canvases.length).toBeLessThanOrEqual(1);
  }, 30_000);
});
