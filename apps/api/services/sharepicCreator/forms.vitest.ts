import { SHAREPIC_FORMS, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  formCatalog,
  formForMaterial,
  formHasMaterial,
  formMismatch,
  missingMaterial,
  namedSharepicForm,
} from './forms.js';

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
    expect(formMismatch('karussell', { locale: 'de-DE', slides: [headline] }, false, '')).toContain(
      '2–8 Slides'
    );
    expect(
      formMismatch('karussell', { locale: 'de-DE', slides: [headline, headline] }, false, '')
    ).toBeNull();
  });

  it('names the count and the way out on a one-slide carousel', () => {
    const mismatch = formMismatch('karussell', { locale: 'de-DE', slides: [headline] }, false, '');
    expect(mismatch).toContain('du hast 1');
    expect(mismatch).toContain('Aufruf-Slide');
  });

  it('holds a single image to one slide', () => {
    expect(
      formMismatch('einzelbild', { locale: 'de-DE', slides: [headline] }, false, '')
    ).toBeNull();
    expect(
      formMismatch('einzelbild', { locale: 'de-DE', slides: [headline, headline] }, false, '')
    ).toContain('genau eine Slide');
  });

  it('wants a quote item for a quote', () => {
    expect(formMismatch('zitat', { locale: 'de-DE', slides: [headline] }, false, '')).toContain(
      '"type":"zitat"'
    );
  });

  it('wants a steckbrief for a Vorstellung', () => {
    expect(
      formMismatch('vorstellung', { locale: 'de-DE', slides: [headline] }, false, '')
    ).toContain('"type":"steckbrief"');
  });

  describe('veranstaltung', () => {
    const noDatum = { locale: 'de-DE' as const, slides: [headline] };
    it('needs no circle when the brief names no date', () => {
      expect(
        formMismatch('veranstaltung', noDatum, false, 'Infoabend zur Grünen Wolke')
      ).toBeNull();
    });
    it.each(['am 20.11.', 'Infoabend am Donnerstag', 'Mo–Fr offen'])(
      'wants the circle when the brief names a date: %s',
      (given) => {
        expect(formMismatch('veranstaltung', noDatum, false, given)).toContain('"datum"');
      }
    );
  });

  // Live-Test 06.11.2026: „mach ein Faktenbild mit dem Bild" — das eigene Foto
  // durfte nie der Hintergrund sein, der Creator verwarf es.
  it('takes an own photo as the Faktenbild background, the number still required', () => {
    const onPhoto = (items: SharepicSpec['slides'][number]['items']) => ({
      locale: 'de-DE' as const,
      slides: [
        {
          ...slide(items),
          background: { kind: 'foto' as const, filename: 'upload:1', textSeite: 'unten' as const },
        },
      ],
    });
    expect(
      formMismatch(
        'faktenbild',
        onPhoto([{ type: 'headline', lines: ['75 % der', 'Wildbienen'] }]),
        false,
        ''
      )
    ).toBeNull();
    expect(formMismatch('faktenbild', onPhoto(headline.items), false, '')).toContain(
      'gehört die Zahl'
    );
  });

  // Live 01.11.2026: „Andere Variante als Faktenbild" kam als Szene mit einer
  // Headline ohne jede Zahl zurück.
  it('wants a number on a Faktenbild scene', () => {
    const spec = (s: ReturnType<typeof slide>) => ({ locale: 'de-DE' as const, slides: [s] });
    expect(formMismatch('faktenbild', spec(headline), false, '')).toContain('"kind":"szene"');
    expect(formMismatch('faktenbild', spec(headline), true, '')).toContain('gehört die Zahl');
    expect(
      formMismatch(
        'faktenbild',
        spec(slide([{ type: 'headline', lines: ['38 % weniger', 'Insekten'] }])),
        true,
        ''
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
        true,
        ''
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
    for (const form of ['einzelbild', 'karussell', 'zahl', 'vergleich'] as const) {
      expect(formHasMaterial(form, ARTENSCHUTZ)).toBe(true);
    }
  });

  it('names what a named form still needs', () => {
    expect(missingMaterial('diagramm', ARTENSCHUTZ)).toBe(
      'mindestens zwei Zahlen, am besten mit Quelle'
    );
    expect(missingMaterial('termine', ARTENSCHUTZ)).toBe('mindestens zwei Termine mit Datum');
    // A speaker is only guessed: a named quote is still tried.
    expect(missingMaterial('zitat', ARTENSCHUTZ)).toBeNull();
    expect(missingMaterial('einzelbild', ARTENSCHUTZ)).toBeNull();
    expect(missingMaterial('diagramm', 'Solar 2020: 12 %, 2025: 31 %')).toBeNull();
  });

  it('wants one number for a Faktenbild', () => {
    expect(formHasMaterial('faktenbild', ARTENSCHUTZ)).toBe(false);
    expect(formHasMaterial('faktenbild', 'Solar deckt 31 % des Stroms')).toBe(true);
    expect(missingMaterial('faktenbild', ARTENSCHUTZ)).toBe('eine Zahl, die das Bild trägt');
    expect(missingMaterial('faktenbild', 'Solar deckt 31 % des Stroms')).toBeNull();
  });

  it('keeps them once the brief brings the material', () => {
    expect(formHasMaterial('diagramm', 'Solar 2020: 12 %, 2025: 31 %')).toBe(true);
    expect(formHasMaterial('zitat', 'Zitat von Lena Grün: „Busse statt Stau für alle“')).toBe(true);
    expect(
      formHasMaterial('termine', 'Aktionstage am 12.05. in Kiel und am 19.05. in Lübeck')
    ).toBe(true);
  });
});

describe('formForMaterial', () => {
  it.each([
    'Mitgliederversammlung am 20.11. um 19 Uhr',
    'Stammtisch am Donnerstag im Café Linde',
    'Infostand am 3. Mai',
  ])('makes a Veranstaltung of a Terminübersicht with one date: %s', (brief) => {
    expect(missingMaterial('termine', brief)).toBe('mindestens zwei Termine mit Datum');
    expect(formForMaterial('termine', brief)).toBe('veranstaltung');
  });

  it('has nothing to offer for a Terminübersicht without any date', () => {
    expect(formForMaterial('termine', 'Terminplan für den Wahlkampf-Endspurt')).toBeNull();
  });

  it('is not asked when the brief has two dates', () => {
    const brief = 'Save the dates: 14.12. Weihnachtsfeier, 18.01. Neujahrsempfang';
    expect(missingMaterial('termine', brief)).toBeNull();
    expect(formForMaterial('termine', brief)).toBeNull();
  });

  it.each(['diagramm', 'rechnung', 'faktenbild', 'zitat', 'karussell'] as const)(
    'offers no substitute for %s',
    (form) => {
      expect(formForMaterial(form, 'Mehr Busse am 20.11.')).toBeNull();
    }
  );
});

describe('formCatalog', () => {
  it('lists every form with the words a person orders it with', () => {
    const catalog = formCatalog();
    for (const form of SHAREPIC_FORMS) {
      expect(catalog).toContain(`\`${form.id}\``);
      expect(catalog).toContain(`(bestellt mit: ${form.stichworte.join(', ')})`);
    }
    expect(catalog.split('\n')).toHaveLength(SHAREPIC_FORMS.length);
  });
});
