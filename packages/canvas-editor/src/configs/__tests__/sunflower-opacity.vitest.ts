import { describe, it, expect, beforeAll } from 'vitest';

import { loadCanvasConfig } from '../configLoader';
import { resolveToolbarOpacity } from '../../hooks/useFloatingModuleState';
import { ZITAT_PURE_CONFIG } from '../../utils/zitatPureLayout';
import { SLIDER_CONFIG } from '../../utils/sliderLayout';

import type { CanvasElementConfig, ImageElementConfig } from '../types';

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

/**
 * The sunflower is `listening`/`draggable`, so clicking it opens the floating
 * toolbar with an opacity slider. Without `opacityStateKey` the slider's
 * writes were dropped silently — `handleOpacityChange` only writes when the
 * element declares the key, so the control looked live and did nothing.
 */
describe('Sonnenblumen-Deckkraft ist einstellbar', () => {
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
});
