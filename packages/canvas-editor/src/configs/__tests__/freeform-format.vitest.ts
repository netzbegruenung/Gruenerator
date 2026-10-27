import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { CANVAS_FORMATS, DEFAULT_FORMAT_ID } from '@ggraphic/editor/formats/index';
import { describe, it, expect, beforeAll } from 'vitest';

import { TEMPLATE_REGISTRY, templateFitsFormat } from '../../utils/templateRegistry';

/**
 * Freeform legt sich auf das Format der Leinwand, statt eine 4:5-Seite auf
 * 3:4 zu strecken: Blatt und Hintergrundflächen kommen aus der Formathöhe.
 * Die Vorlagen bleiben 4:5.
 */
describe('Freeform im Leinwandformat', () => {
  beforeAll(async () => {
    await loadCanvasConfig('freeform');
  }, 120_000);

  it('kennt 4:5 als Standard, 3:4 und das Profilbild-Quadrat', () => {
    expect(DEFAULT_FORMAT_ID).toBe('post-portrait');
    const digital = CANVAS_FORMATS.filter((f) => f.category === 'digital');
    expect(digital.map((f) => [f.id, f.width, f.height])).toEqual([
      ['post-portrait', 1080, 1350],
      ['post-portrait-tall', 1080, 1440],
      ['profile-square', 1080, 1080],
      ['slide-16-9', 1920, 1080],
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
      // Passen heißt: das Blatt hat das Seitenverhältnis des Formats. Sonst
      // skaliert die Bühne je Achse und streckt die Seite (#4087).
      for (const format of CANVAS_FORMATS) {
        const sheet = (await loadCanvasConfig(id, format.id)).canvas;
        const sameAspect = sheet.width * format.height === sheet.height * format.width;
        // Auf ein Druckformat passt nur die leere Freeform-Seite.
        const fits =
          format.category === 'digital' ? sameAspect : id === 'freeform' || id === 'freeform-at';
        if (fits) expect(sameAspect, format.id).toBe(true);
        expect(templateFitsFormat(id, format.id), format.id).toBe(fits);
      }
      // Unbekannte und fehlende Ids lösen auf 4:5 auf.
      const fitsDefault = templateFitsFormat(id, 'post-portrait');
      expect(templateFitsFormat(id)).toBe(fitsDefault);
      expect(templateFitsFormat(id, 'story')).toBe(fitsDefault);
    },
    20_000
  );
});
