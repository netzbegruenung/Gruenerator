import { describe, expect, it } from 'vitest';

import { repairOrt } from './ortRepair.js';

// #5347: the order names no place; the model wrote „Online-Meeting / Link via Mail“.
const NO_PLACE =
  'Erstelle mir ein lustiges Sharepic für eine Informationsveranstaltung mit dem Namen "Einführung zur Nutzung der Grünen Wolke".';
const WITH_PLACE = 'Sommerfest am 14.11. um 19 Uhr im Café Linde, Gartenstraße 5 in Kassel.';

const withOrt = (lines: string[]) => ({
  slides: [
    {
      background: { kind: 'farbe', color: 'weiss' },
      items: [{ type: 'headline', lines: ['Komm vorbei'] }],
      ort: { lines },
    },
  ],
});

const repair = (lines: string[], given: string) => {
  const { input, repairs } = repairOrt(withOrt(lines), given);
  const slide = (input as ReturnType<typeof withOrt>).slides[0] as { ort?: { lines: string[] } };
  return { ort: slide.ort, repairs };
};

describe('repairOrt', () => {
  it('drops a place the order does not name and reports it', () => {
    const out = repair(['Online-Meeting', 'Link via Mail'], NO_PLACE);
    expect(out.ort).toBeUndefined();
    expect(out.repairs).toEqual([
      { slide: 0, feld: 'ort', wert: 'Online-Meeting / Link via Mail' },
    ]);
  });

  it('keeps a place from the order, reworded or inflected', () => {
    expect(repair(['Café Linde', 'Gartenstraße 5, Kassel'], WITH_PLACE)).toEqual({
      ort: { lines: ['Café Linde', 'Gartenstraße 5, Kassel'] },
      repairs: [],
    });
  });

  it('drops only the invented line and keeps the given one', () => {
    const out = repair(['Café Linde', 'Eingang über den Hinterhof'], WITH_PLACE);
    expect(out.ort).toEqual({ lines: ['Café Linde'] });
    expect(out.repairs).toEqual([{ slide: 0, feld: 'ort', wert: 'Eingang über den Hinterhof' }]);
  });

  it('reads the place from conversation material in `given`, not only the order', () => {
    const given = `${NO_PLACE}\n\nEinladung (eingefügt): Wir treffen uns online, den Link gibt es per Mail.`;
    expect(repair(['Online', 'Link per Mail'], given).repairs).toEqual([]);
  });

  it('leaves a draft without ort untouched', () => {
    const input = { slides: [{ background: { kind: 'farbe', color: 'weiss' }, items: [] }] };
    expect(repairOrt(input, NO_PLACE)).toEqual({ input, repairs: [] });
  });
});
