import { printSpecSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composePrint, PRINT_IMPRESSUM_ID } from './composePrint';
import { PRINT_VORLAGEN, printVorlagenFor } from './printVorlagen';

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

describe('PRINT_VORLAGEN', () => {
  it('führt die F0-Ids', () => {
    expect(PRINT_VORLAGEN.map((v) => v.id)).toEqual([
      'de-visitenkarte-quer',
      'de-visitenkarte-hoch',
      'de-plakat-typo-a3',
      'at-visitenkarte-quer',
      'at-visitenkarte-hoch',
      'at-plakat-typo-a3',
    ]);
  });

  it.each(PRINT_VORLAGEN.map((v) => [v.id, v] as const))(
    '%s: Spec ist gültig, passt zum Land und komponiert',
    (id, v) => {
      // Parsing must not change it: optional slots are absent, not empty.
      expect(printSpecSchema.parse(v.spec)).toEqual(v.spec);
      expect(v.spec.locale).toBe(v.locale);
      expect(v.thumb).toBe(`/vorlagen/print/${id}.webp`);
      const composed = composePrint(v.spec, { measure });
      expect(composed.format).toBe(v.spec.format);
      if (v.spec.produkt === 'plakat') {
        const texts = composed.slides.flatMap((s) => s.additionalTexts);
        expect(texts.some((t) => t.id === PRINT_IMPRESSUM_ID)).toBe(true);
      }
    }
  );

  it('je Land drei Vorlagen', () => {
    expect(printVorlagenFor('de-DE')).toHaveLength(3);
    expect(printVorlagenFor('de-AT')).toHaveLength(3);
  });
});
