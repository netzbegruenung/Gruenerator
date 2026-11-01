import { SHAREPIC_FORMS, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { formHasMaterial, formMismatch, namedSharepicForm, wantsOneSlide } from './forms.js';

describe('SHAREPIC_FORMS stichworte', () => {
  // The hints the Vorlagen gallery shows must be words the matcher really takes.
  it.each(SHAREPIC_FORMS.flatMap((f) => f.stichworte.map((w) => [w, f.id] as const)))(
    'Sharepic: %s → %s',
    (stichwort, form) => {
      expect(namedSharepicForm(`Erstelle ein Sharepic, ${stichwort} zum Radverkehr`)).toBe(form);
    }
  );
});

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
    ['Steckbrief für unsere Kandidatin Lena', 'vorstellung'],
    ['Ein Vorstellungspost für Jonas, Imker und Radfahrer', 'vorstellung'],
    ['Ich stelle mich vor: Lena, Imkerin aus Kassel', 'vorstellung'],
    ['Vorstellung unseres Wahlprogramms', null],
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

describe('wantsOneSlide', () => {
  const one = (text: string) => wantsOneSlide(text, namedSharepicForm(text));

  it.each([
    'erstelle ein sharepic um neue mitglieder für die grünen im rhein sieg kreis zu werben',
    'Sharepic zu 5 Gründen, Mitglied zu werden',
    'Mach eine Infografik zum Radverkehr',
    'Sharepic, bitte kein Karussell',
    'Erstelle ein Sharepic, nicht mehrere, zur Mitgliederwerbung',
    'Ein Sharepic, keine Serie',
  ])('one slide: %s', (text) => {
    expect(one(text)).toBe(true);
  });

  it.each([
    'Karussell zur Windkraft',
    'erstelle 3 sharepics zur Mitgliederwerbung',
    'mehrere Sharepics zum Klimaschutz',
    'ein Interview-Sharepic mit Anna',
    'Infografik im Karussell',
    'Sharepic-Serie zur Kommunalwahl',
    'Mach 4 Slides zum ÖPNV',
  ])('several slides: %s', (text) => {
    expect(one(text)).toBe(false);
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

  it('holds a carousel to at least two slides', () => {
    expect(formMismatch('karussell', { locale: 'de-DE', slides: [headline] }, false)).toContain(
      '2–8 Slides'
    );
    expect(
      formMismatch('karussell', { locale: 'de-DE', slides: [headline, headline] }, false)
    ).toBeNull();
  });

  it('names the count and the way out on a one-slide carousel', () => {
    const mismatch = formMismatch('karussell', { locale: 'de-DE', slides: [headline] }, false);
    expect(mismatch).toContain('du hast 1');
    expect(mismatch).toContain('Aufruf-Slide');
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

  it('wants a steckbrief for a Vorstellung', () => {
    expect(formMismatch('vorstellung', { locale: 'de-DE', slides: [headline] }, false)).toContain(
      '"type":"steckbrief"'
    );
  });

  // Live 01.11.2026: „Andere Variante als Faktenbild" kam als Szene mit einer
  // Headline ohne jede Zahl zurück.
  it('wants a number on a Faktenbild scene', () => {
    const spec = (s: ReturnType<typeof slide>) => ({ locale: 'de-DE' as const, slides: [s] });
    expect(formMismatch('faktenbild', spec(headline), false)).toContain('"kind":"szene"');
    expect(formMismatch('faktenbild', spec(headline), true)).toContain('gehört die Zahl');
    expect(
      formMismatch(
        'faktenbild',
        spec(slide([{ type: 'headline', lines: ['38 % weniger', 'Insekten'] }])),
        true
      )
    ).toBeNull();
    expect(
      formMismatch(
        'faktenbild',
        spec(
          slide([
            { type: 'headline', lines: ['Busse statt Stau'] },
            { type: 'diagramm', art: 'balken', werte: [] } as never,
          ])
        ),
        true
      )
    ).toBeNull();
  });
});

describe('formHasMaterial', () => {
  const ARTENSCHUTZ = 'Zeit für mehr Artenschutz jetzt! Wir müssen unsere Biodiversität retten.';

  it('drops forms whose block the brief cannot fill', () => {
    expect(formHasMaterial('diagramm', ARTENSCHUTZ)).toBe(false);
    expect(formHasMaterial('rechnung', ARTENSCHUTZ)).toBe(false);
    expect(formHasMaterial('zitat', ARTENSCHUTZ)).toBe(false);
    expect(formHasMaterial('termine', ARTENSCHUTZ)).toBe(false);
  });

  it('keeps forms that work without numbers, people or dates', () => {
    for (const form of ['einzelbild', 'karussell', 'zahl', 'faktenbild', 'vergleich'] as const) {
      expect(formHasMaterial(form, ARTENSCHUTZ)).toBe(true);
    }
  });

  it('keeps them once the brief brings the material', () => {
    expect(formHasMaterial('diagramm', 'Solar 2020: 12 %, 2025: 31 %')).toBe(true);
    expect(formHasMaterial('zitat', 'Zitat von Lena Grün: „Busse statt Stau für alle“')).toBe(true);
    expect(
      formHasMaterial('termine', 'Aktionstage am 12.05. in Kiel und am 19.05. in Lübeck')
    ).toBe(true);
  });
});
