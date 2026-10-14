import type { SharepicSlide } from '@gruenerator/contracts';

const REST = [
  'Kürze den Text',
  'Schlag ein anderes Farbschema vor',
  'Recherchiere passende Fakten dazu',
];

/**
 * The chat's starter prompts. The quote prompt only where the canvas shows a
 * quote: a quote template, or a creator page with a `zitat` item.
 */
export function canvasQuickPrompts(configId: string, slide: SharepicSlide | null): string[] {
  const hasQuote = slide
    ? slide.items.some((item) => item.type === 'zitat')
    : configId.startsWith('zitat');
  return [hasQuote ? 'Mach das Zitat schlagkräftiger' : 'Mach den Text schlagkräftiger', ...REST];
}
