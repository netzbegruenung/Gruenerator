import { describe, it, expect, beforeAll } from 'vitest';

import { CANVAS_FORMATS, DEFAULT_FORMAT_ID } from '../../formats';
import { TEMPLATE_REGISTRY, templateFitsFormat } from '../../utils/templateRegistry';
import { loadCanvasConfig } from '../configLoader';

/**
 * Freeform legt sich auf das Format der Leinwand, statt eine 4:5-Seite auf
 * 3:4 zu strecken: Blatt und Hintergrundflächen kommen aus der Formathöhe.
 * Die Vorlagen bleiben 4:5.
 */
describe('Freeform im Leinwandformat', () => {
  beforeAll(async () => {
    await loadCanvasConfig('freeform');
  }, 120_000);

  it('kennt 4:5 als Standard und 3:4 als zweites Format', () => {
    expect(DEFAULT_FORMAT_ID).toBe('post-portrait');
    expect(CANVAS_FORMATS.map((f) => [f.id, f.width, f.height])).toEqual([
      ['post-portrait', 1080, 1350],
      ['post-portrait-tall', 1080, 1440],
    ]);
  });

  it.each(['freeform', 'freeform-at'] as const)(
    '%s nimmt die Höhe des Formats',
    async (id) => {
      const config = await loadCanvasConfig(id, 'post-portrait-tall');
      expect(config.canvas).toEqual({ width: 1080, height: 1440 });
      for (const element of config.elements) {
        if (element.id.startsWith('background-')) {
          expect(element).toMatchObject({ width: 1080, height: 1440 });
        }
      }
    },
    20_000
  );

  it('ohne oder mit unbekanntem Format bleibt es 4:5', async () => {
    const configs = [
      await loadCanvasConfig('freeform'),
      await loadCanvasConfig('freeform', 'post-portrait'),
      await loadCanvasConfig('freeform', 'unbekannt'),
    ];
    for (const config of configs) {
      expect(config.canvas).toEqual({ width: 1080, height: 1350 });
    }
  });

  it('die Vorlagen bleiben im 3:4-Dokument 4:5', async () => {
    const config = await loadCanvasConfig('dreizeilen', 'post-portrait-tall');
    expect(config.canvas).toEqual({ width: 1080, height: 1350 });
  });

  // Die Picker fragen `followsFormat`, der Loader baut das Blatt: beide müssen
  // dieselbe Antwort geben, sonst landet eine gestreckte Seite im Dokument.
  it.each(Object.keys(TEMPLATE_REGISTRY) as Array<keyof typeof TEMPLATE_REGISTRY>)(
    '%s: followsFormat stimmt mit dem geladenen Blatt überein',
    async (id) => {
      const config = await loadCanvasConfig(id, 'post-portrait-tall');
      const follows = config.canvas.height === 1440;
      expect(!!TEMPLATE_REGISTRY[id].followsFormat).toBe(follows);
      expect(templateFitsFormat(id, 'post-portrait-tall')).toBe(follows);
      expect(templateFitsFormat(id, 'post-portrait')).toBe(true);
      expect(templateFitsFormat(id)).toBe(true);
    },
    20_000
  );
});
