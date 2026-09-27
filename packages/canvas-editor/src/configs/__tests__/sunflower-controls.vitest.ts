import { describe, it, expect, beforeAll } from 'vitest';

import { loadCanvasConfig } from '../configLoader';
import { resolveToolbarOpacity } from '../../hooks/useFloatingModuleState';
import { ZITAT_PURE_CONFIG } from '../../utils/zitatPureLayout';
import { SLIDER_CONFIG } from '../../utils/sliderLayout';

import type { CanvasElementConfig, ImageElementConfig } from '../types';

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

/**
 * The sunflower is `listening`/`draggable`, so it can be selected and moved.
 * Both edits route through a declared state key: `handleOpacityChange` writes
 * only with `opacityStateKey`, `handleImageDragEnd` only with `offsetKey` (or
 * `positionStateKey`). Without them the controls look live and drop every
 * write silently.
 */
describe('Sonnenblume ist bearbeitbar', () => {
  // The first dynamic import pulls the whole Konva chain in; pay it once.
  beforeAll(async () => {
    await loadCanvasConfig('zitat-pure');
  }, 120_000);

  const findSunflower = (elements: CanvasElementConfig<never>[]): ImageElementConfig<never> => {
    const el = elements.find((e) => e.id === 'sunflower');
    expect(el, 'sunflower element missing').toBeTruthy();
    expect(el!.type).toBe('image');
    return el as ImageElementConfig<never>;
  };

  const SUNFLOWER_TEMPLATES: [CanvasConfigType, number][] = [
    ['zitat-pure', ZITAT_PURE_CONFIG.sunflower.opacity],
    ['slider', SLIDER_CONFIG.sunflower.opacity],
  ];

  it.each(SUNFLOWER_TEMPLATES)(
    '%s: sunflower declares opacityStateKey and keeps its default',
    async (id, defaultOpacity) => {
      const config = await loadCanvasConfig(id);
      const sunflower = findSunflower(config.elements as CanvasElementConfig<never>[]);

      expect(sunflower.opacityStateKey).toBe('sunflowerOpacity');

      // Untouched: toolbar and canvas agree on the template's faint default.
      expect(resolveToolbarOpacity(sunflower, {}, {})).toBeCloseTo(defaultOpacity);
      // Edited: the state key wins.
      expect(resolveToolbarOpacity(sunflower, { sunflowerOpacity: 0.42 }, {})).toBe(0.42);
    }
  );

  it('zitat-pure carries sunflowerOpacity through a state re-seed', async () => {
    const config = await loadCanvasConfig('zitat-pure');
    const seeded = config.createInitialState({ quote: 'Test', sunflowerOpacity: 0.42 }) as Record<
      string,
      unknown
    >;

    expect(seeded.sunflowerOpacity).toBe(0.42);
  });

  it('slider carries sunflowerOpacity through a state re-seed', async () => {
    const config = await loadCanvasConfig('slider');
    const seeded = config.createInitialState({
      headline: 'Test',
      sunflowerOpacity: 0.42,
    }) as Record<string, unknown>;

    expect(seeded.sunflowerOpacity).toBe(0.42);
  });

  it.each(SUNFLOWER_TEMPLATES)('%s: sunflower drag lands in state', async (id) => {
    const config = await loadCanvasConfig(id);
    const sunflower = findSunflower(config.elements as CanvasElementConfig<never>[]);

    // Offset over absolute position: both x and y are constants, so the
    // element has a stable base to offset from.
    expect(sunflower.offsetKey).toBe('sunflowerOffset');
    expect(typeof sunflower.x).toBe('number');
    expect(typeof sunflower.y).toBe('number');
  });

  it.each(SUNFLOWER_TEMPLATES)('%s: sunflower drag survives a state re-seed', async (id) => {
    const config = await loadCanvasConfig(id);
    const offset = { x: -120, y: 80 };
    const seeded = config.createInitialState({ sunflowerOffset: offset }) as Record<
      string,
      unknown
    >;

    expect(seeded.sunflowerOffset).toEqual(offset);
  });
});
