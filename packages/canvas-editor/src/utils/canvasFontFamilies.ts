import type { CanvasElementConfig, FullCanvasConfig } from '../configs/types';

/**
 * Every family the template actually paints. Derived from the elements rather
 * than read from `config.fonts.primary` alone: a Konva paint is not a DOM font
 * usage, so a family nobody preloads is still unloaded at first paint and the
 * fallback face gets baked into the canvas. Templates whose layout is pure
 * arithmetic (zitat) never re-render afterwards, so it stays baked in.
 */
export function canvasFontFamilies<TState>(config: {
  fonts?: FullCanvasConfig['fonts'];
  elements: readonly CanvasElementConfig<TState>[];
}): string[] {
  const families = new Set<string>();
  if (config.fonts?.primary) families.add(config.fonts.primary);
  for (const element of config.elements) {
    if (element.type !== 'text') continue;
    // Element families carry a ', Arial, sans-serif' fallback stack — only the
    // first entry is a webfont we can wait for.
    const family = element.fontFamily.split(',')[0]?.trim();
    if (family) families.add(family);
  }
  return Array.from(families);
}
