import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { formMismatch, namedSharepicForm } from './forms.js';

describe('namedSharepicForm', () => {
  it.each([
    ['Sharepic', null],
    ['Mach ein Sharepic zum Klimaschutz', null],
    ['Erstelle ein Zitat-Sharepic von Leonore Gewessler', 'zitat'],
    ['Karussell: warum die Mieten steigen', 'karussell'],
    ['Erstelle eine Info-Grafik zum Radverkehr', 'infografik'],
    ['Infografik: Mieten in Graz +38 % seit 2015', 'infografik'],
    ['Ein Karussell mit einer Infografik zu den Mieten', 'infografik'],
    ['Balkendiagramm zu den Mieten seit 2015', 'diagramm'],
    ['Faktencheck: Windräder töten Vögel', 'faktencheck'],
    ['Faktenbild zum Solarausbau', 'faktenbild'],
    ['Sharepic zum Termin am 5. Mai im Rathaus', 'veranstaltung'],
    ['Vergleich: ihr Plan gegen unseren', 'vergleich'],
    ['Interview mit unserer Bürgermeisterin', 'interview'],
    ['Sharepic als Rechnung: 63 € minus 5,75 €', 'rechnung'],
    ['Sharepic mit unseren Terminen der Klimawoche', 'termine'],
    ['Sharepic für Österreich mit einer großen Zahl: 3,1 Grad', 'zahl'],
    ['Infografik mit einer großen Zahl: 420 €', 'infografik'],
    ['Noch 3 Tage bis zur Wahl!', 'zahl'],
  ])('%s → %s', (text, form) => {
    expect(namedSharepicForm(text)).toBe(form);
  });

  it('ignores a form the request rules out', () => {
    expect(namedSharepicForm('Sharepic zum Radverkehr, kein Karussell')).toBeNull();
    expect(namedSharepicForm('Sharepic ohne Zitat zum Radverkehr')).toBeNull();
  });

  it('does not take a comparison in passing for the form', () => {
    expect(namedSharepicForm('Mieten sind im Vergleich zu 2015 um 38 % gestiegen')).toBeNull();
  });

  it('needs the word on its own, not inside another', () => {
    expect(namedSharepicForm('Sharepic zu den Zwischenterminen')).toBeNull();
    expect(namedSharepicForm('Bringt uns die Gasrechnung ins Schwitzen?')).toBeNull();
  });
});

describe('formMismatch', () => {
  const slide = (items: SharepicSpec['slides'][number]['items']) => ({
    background: { kind: 'farbe' as const, color: 'tanne' as const },
    position: 'mitte' as const,
    align: 'links' as const,
    items,
    logo: false,
  });
  const headline = slide([{ type: 'headline', lines: ['Busse statt Stau'] }]);

  it('holds a carousel to at least three slides', () => {
    expect(formMismatch('karussell', { locale: 'de-DE', slides: [headline] }, false)).toContain(
      '3–8 Slides'
    );
    expect(
      formMismatch('karussell', { locale: 'de-DE', slides: [headline, headline, headline] }, false)
    ).toBeNull();
  });

  it('holds a single image to one slide', () => {
    expect(formMismatch('einzelbild', { locale: 'de-DE', slides: [headline] }, false)).toBeNull();
    expect(
      formMismatch('einzelbild', { locale: 'de-DE', slides: [headline, headline] }, false)
    ).toContain('genau eine Slide');
  });

  it('wants a quote item for a quote', () => {
    expect(formMismatch('zitat', { locale: 'de-DE', slides: [headline] }, false)).toContain(
      '"type":"zitat"'
    );
  });
});
