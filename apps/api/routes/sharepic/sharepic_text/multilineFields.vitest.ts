import { SHAREPIC_GEN_TO_CANVAS_TYPE, getSharepicTemplateDescriptor } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

import { TYPE_CONFIGS } from './unifiedHandler.js';

/**
 * Drei Listen sagen, wo Auszeichnung erlaubt ist: `richText` am Descriptor
 * (Contract), `richText` am Textelement (Editor) und `markupFields` hier
 * (KI-Sanitizer). Läuft eine davon weg, streicht `sanitizeField` das Fett,
 * das der Editor zeichnet — oder umgekehrt landet ein `**` roh auf der
 * Leinwand. Der Editor-Test (`richTextParity.vitest.ts`) prüft Descriptor ⇔
 * Element; dieser hier Descriptor ⇔ Sanitizer.
 */
describe('TYPE_CONFIGS: Auszeichnungsfelder', () => {
  const entries = Object.entries(TYPE_CONFIGS).map(([genType, config]) => {
    const canvasType =
      SHAREPIC_GEN_TO_CANVAS_TYPE[genType as keyof typeof SHAREPIC_GEN_TO_CANVAS_TYPE] ?? genType;
    return { genType, config, descriptor: getSharepicTemplateDescriptor(canvasType) };
  });

  for (const { genType, config, descriptor } of entries) {
    if (!descriptor) continue;

    it(`${genType}: markupFields deckt sich mit richText am Descriptor`, () => {
      const rich = descriptor.textFields
        .filter((f) => f.richText)
        .map((f) => f.field)
        .sort();
      expect([...(config.markupFields ?? [])].sort()).toEqual(rich);
    });
  }

  it('markupFields ist immer eine Teilmenge von multilineFields', () => {
    // Auszeichnung ohne erhaltene Zeilenumbrüche gibt es nicht: `sanitizeField`
    // wertet `keepMarks` nur im mehrzeiligen Zweig aus.
    for (const [genType, config] of Object.entries(TYPE_CONFIGS)) {
      for (const field of config.markupFields ?? []) {
        expect(config.multilineFields ?? [], `${genType}.${field}`).toContain(field);
      }
    }
  });
});
