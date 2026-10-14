import { describe, expect, it } from 'vitest';

import { canvasQuickPrompts } from './canvasQuickPrompts';

import type { SharepicSlide } from '@gruenerator/contracts';

const QUOTE = 'Mach das Zitat schlagkräftiger';

const slide = (items: SharepicSlide['items']) =>
  ({
    background: { kind: 'farbe', color: 'tanne' },
    position: 'mitte',
    align: 'links',
    items,
  }) as SharepicSlide;

describe('canvasQuickPrompts', () => {
  it('offers the quote prompt on quote templates', () => {
    for (const id of ['zitat', 'zitat-pure', 'zitat-at', 'zitat-pure-at']) {
      expect(canvasQuickPrompts(id, null)).toContain(QUOTE);
    }
  });

  it('does not offer it where there is no quote', () => {
    expect(canvasQuickPrompts('dreizeilen', null)).not.toContain(QUOTE);
    expect(
      canvasQuickPrompts('freeform', slide([{ type: 'liste', items: ['Bahn', 'Rad'] }]))
    ).not.toContain(QUOTE);
  });

  it('reads a creator page by its items', () => {
    const zitat = slide([{ type: 'zitat', text: 'Klimaschutz ist Heimatschutz', name: 'A' }]);
    expect(canvasQuickPrompts('freeform', zitat)).toContain(QUOTE);
  });
});
