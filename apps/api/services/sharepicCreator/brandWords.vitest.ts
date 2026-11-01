import { describe, expect, it } from 'vitest';

import { namesGjDesign, requestedBrand } from './brandWords.js';

describe('namesGjDesign', () => {
  it.each([
    'Mach ein Sharepic im Grüne Jugend Design zum Mietendeckel',
    'Sharepic für die GRÜNE JUGEND: Ausbildungsplätze jetzt',
    'Karussell im Grüne-Jugend-Design über das Deutschlandticket',
    'ein sharepic im GJ-Design bitte',
    'Sharepic, GJ Design, Thema Klimageld',
    'Erstelle ein Sharepic für die Gruene Jugend',
    'Sharepic der Grünen Jugend zur Demo',
  ])('erkennt „%s“', (text) => {
    expect(namesGjDesign(text)).toBe(true);
    expect(requestedBrand(text)).toBe('gruene-jugend');
  });

  it.each([
    'Mach ein Sharepic zum Mietendeckel',
    'Sharepic über die Jugend von heute',
    'Grüne Politik für junge Menschen',
    'Sharepic zum GJ-Bundeskongress',
    'ein Sharepic mit den Worten „grün, jung, laut“',
  ])('lässt „%s“ beim Design der Partei', (text) => {
    expect(namesGjDesign(text)).toBe(false);
    expect(requestedBrand(text)).toBeNull();
  });
});
