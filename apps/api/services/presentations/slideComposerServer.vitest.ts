import { SLIDE_LAYOUTS, buildSlideLayout } from '@gruenerator/contracts/slides';
import { describe, expect, it } from 'vitest';

const DATE = new Date('2026-10-29T12:00:00Z');
const LOCALES = ['de-DE', 'de-AT'] as const;

describe('slide composer on the server', () => {
  for (const locale of LOCALES) {
    for (const { id } of SLIDE_LAYOUTS) {
      it(`builds ${id} for ${locale}`, () => {
        const slide = buildSlideLayout(id, { locale, pageNumber: 2, date: DATE });
        expect(slide.additionalTexts.length).toBeGreaterThan(0);

        const known = new Set<string>([
          ...slide.additionalTexts.map((e) => e.id),
          ...slide.shapeInstances.map((e) => e.id),
          ...slide.assetInstances.map((e) => e.id),
          ...slide.chartInstances.map((e) => e.id),
          ...slide.pillBadgeInstances.map((e) => e.id),
          ...slide.circleBadgeInstances.map((e) => e.id),
          ...slide.userImageInstances.map((e) => e.id),
        ]);
        for (const layerId of slide.layerOrder) expect(known.has(layerId)).toBe(true);
      });
    }
  }

  it('textfolie carries headline and two columns', () => {
    const slide = buildSlideLayout('textfolie', { locale: 'de-DE', pageNumber: 2, date: DATE });
    const ids = slide.additionalTexts.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(['folie-headline', 'folie-spalte-1', 'folie-spalte-2'])
    );
  });
});
