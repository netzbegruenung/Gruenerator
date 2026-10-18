import { describe, expect, it } from 'vitest';

import { printFotoSrc, printImpressumSchema, printSpecSchema } from './printCreator.js';

const visdp = { art: 'visdp', name: 'Max Muster', anschrift: 'Musterstr. 1, 10115 Berlin' };
const medien = { art: 'impressum', medieninhaber: 'Die Grünen Wien', anschrift: 'Lindengasse 40' };

const karte = {
  locale: 'de-DE',
  produkt: 'visitenkarte',
  variante: 'visitenkarte',
  format: 'print-visitenkarte-quer',
  slots: { name: ' Max Muster ', mail: 'max@example.org' },
  impressum: null,
};
const plakat = {
  locale: 'de-DE',
  produkt: 'plakat',
  variante: 'typo',
  format: 'print-a3-hoch',
  slots: { headline: 'Klimaschutz jetzt' },
  impressum: visdp,
};

describe('printSpecSchema', () => {
  it('accepts a business card and trims strings', () => {
    const r = printSpecSchema.safeParse(karte);
    expect(r.success).toBe(true);
    if (r.success && r.data.variante === 'visitenkarte')
      expect(r.data.slots.name).toBe('Max Muster');
  });

  it('accepts a poster in A3 and A4, and AT with impressum', () => {
    expect(printSpecSchema.safeParse(plakat).success).toBe(true);
    expect(printSpecSchema.safeParse({ ...plakat, format: 'print-a4-hoch' }).success).toBe(true);
    expect(
      printSpecSchema.safeParse({ ...plakat, locale: 'de-AT', impressum: medien }).success
    ).toBe(true);
  });

  it('rejects slots of the wrong variant and missing required slots', () => {
    expect(printSpecSchema.safeParse({ ...karte, slots: { headline: 'x' } }).success).toBe(false);
    expect(printSpecSchema.safeParse({ ...plakat, slots: { subline: 'x' } }).success).toBe(false);
    expect(printSpecSchema.safeParse({ ...karte, slots: { name: '   ' } }).success).toBe(false);
  });

  it('enforces length caps', () => {
    expect(printSpecSchema.safeParse({ ...karte, slots: { name: 'x'.repeat(61) } }).success).toBe(
      false
    );
    expect(
      printSpecSchema.safeParse({ ...plakat, slots: { headline: 'x'.repeat(81) } }).success
    ).toBe(false);
    expect(
      printSpecSchema.safeParse({ ...plakat, slots: { headline: 'a', web: 'x'.repeat(121) } })
        .success
    ).toBe(false);
  });

  it('rejects unknown formats and variant/format mismatches', () => {
    expect(printSpecSchema.safeParse({ ...karte, format: 'print-a5' }).success).toBe(false);
    expect(printSpecSchema.safeParse({ ...karte, format: 'print-a3-hoch' }).success).toBe(false);
    expect(
      printSpecSchema.safeParse({ ...plakat, format: 'print-visitenkarte-quer' }).success
    ).toBe(false);
  });

  it('rejects produkt inconsistent with variante', () => {
    expect(
      printSpecSchema.safeParse({ ...karte, produkt: 'plakat', impressum: visdp }).success
    ).toBe(false);
    expect(printSpecSchema.safeParse({ ...plakat, produkt: 'visitenkarte' }).success).toBe(false);
  });

  it('takes a colourway only where the variante offers it in that country', () => {
    expect(printSpecSchema.safeParse({ ...karte, stil: 'klee' }).success).toBe(true);
    expect(printSpecSchema.safeParse({ ...karte, stil: 'sand' }).success).toBe(true);
    expect(
      printSpecSchema.safeParse({ ...karte, locale: 'de-AT', stil: 'hellgruen' }).success
    ).toBe(true);
    expect(printSpecSchema.safeParse({ ...karte, stil: 'hellgruen' }).success).toBe(false);
    expect(printSpecSchema.safeParse({ ...karte, locale: 'de-AT', stil: 'klee' }).success).toBe(
      false
    );
    expect(printSpecSchema.safeParse({ ...plakat, stil: 'sand' }).success).toBe(false);
    expect(printSpecSchema.safeParse({ ...karte, stil: 'lila' }).success).toBe(false);
  });

  it('requires an impressum for posters', () => {
    expect(printSpecSchema.safeParse({ ...plakat, impressum: null }).success).toBe(false);
  });

  it('requires impressum.art to match the locale', () => {
    expect(printSpecSchema.safeParse({ ...plakat, impressum: medien }).success).toBe(false);
    expect(printSpecSchema.safeParse({ ...plakat, locale: 'de-AT' }).success).toBe(false);
    expect(printSpecSchema.safeParse({ ...karte, locale: 'de-AT', impressum: visdp }).success).toBe(
      false
    );
  });
});

describe('printSpecSchema: photo posters', () => {
  const kandidat = {
    locale: 'de-DE',
    produkt: 'plakat',
    variante: 'kandidat',
    format: 'print-a1-hoch',
    impressum: visdp,
    slots: { name: 'Pit Mende', subline: 'Für NRW in den Landtag', foto: 'vorlage:person.jpg' },
  };
  const veranstaltung = {
    locale: 'de-DE',
    produkt: 'plakat',
    variante: 'veranstaltung',
    format: 'print-a3-quer',
    impressum: visdp,
    slots: {
      headline: 'Wie wird die Stadt klimafest?',
      mitwirkende: [{ rolle: 'Es diskutieren:', name: 'Kim Grün' }],
      foto: 'wind-unsplash.jpg',
    },
  };

  it('accepts candidate, topic and event posters on their formats', () => {
    expect(printSpecSchema.safeParse(kandidat).success).toBe(true);
    for (const format of ['print-a3-hoch', 'print-grossflaeche', 'print-citylight']) {
      expect(printSpecSchema.safeParse({ ...kandidat, format }).success, format).toBe(true);
    }
    expect(
      printSpecSchema.safeParse({
        ...kandidat,
        variante: 'thema',
        stil: 'klee',
        slots: { headline: 'Bus und Bahn für alle', foto: 'x.jpg' },
      }).success
    ).toBe(true);
    expect(printSpecSchema.safeParse(veranstaltung).success).toBe(true);
  });

  it('takes only stock files and catalogue photos, the latter exactly as named', () => {
    for (const foto of [
      'upload:1',
      'ki:abc',
      'https://example.org/a.jpg',
      'vorlage:../x.jpg',
      'VORLAGE:person.jpg',
      'vorlage:Person.JPG',
    ]) {
      expect(
        printSpecSchema.safeParse({ ...kandidat, slots: { ...kandidat.slots, foto } }).success,
        foto
      ).toBe(false);
    }
  });

  it('needs a photo for the event poster V1, none for the portraits variant', () => {
    const { foto: _, ...ohneFoto } = veranstaltung.slots;
    expect(printSpecSchema.safeParse({ ...veranstaltung, slots: ohneFoto }).success).toBe(false);
    expect(
      printSpecSchema.safeParse({ ...veranstaltung, stil: 'portraits', slots: ohneFoto }).success
    ).toBe(true);
  });

  it('offers the DE photo posters in Germany only', () => {
    const at = { art: 'impressum', medieninhaber: 'Die Grünen Wien', anschrift: 'Lindengasse 40' };
    expect(printSpecSchema.safeParse({ ...kandidat, locale: 'de-AT', impressum: at }).success).toBe(
      false
    );
  });

  it('keeps each variante on its formats and caps the speakers', () => {
    expect(printSpecSchema.safeParse({ ...kandidat, format: 'print-a3-quer' }).success).toBe(false);
    expect(
      printSpecSchema.safeParse({ ...veranstaltung, format: 'print-grossflaeche' }).success
    ).toBe(false);
    const fuenf = Array.from({ length: 5 }, (_, i) => ({ name: `Person ${i}` }));
    expect(
      printSpecSchema.safeParse({
        ...veranstaltung,
        slots: { ...veranstaltung.slots, mitwirkende: fuenf },
      }).success
    ).toBe(false);
  });
});

describe('printSpecSchema: AT posters', () => {
  const at = { art: 'impressum', medieninhaber: 'Die Grünen Wien', anschrift: 'Lindengasse 40' };
  const plakat = (variante: string, extra: object = {}) => ({
    locale: 'de-AT',
    produkt: 'plakat',
    variante,
    format: 'print-a1-hoch',
    impressum: at,
    slots: { headline: 'Das ist eine dreizeilige Headline.', akzent: 'dreizeilige', foto: 'x.jpg' },
    ...extra,
  });

  it('accepts split, overlay and person posters in Austria only', () => {
    for (const variante of ['geteilt', 'overlay', 'person']) {
      expect(printSpecSchema.safeParse(plakat(variante)).success, variante).toBe(true);
      expect(printSpecSchema.safeParse(plakat(variante, { format: 'print-a3-quer' })).success).toBe(
        true
      );
      expect(
        printSpecSchema.safeParse(
          plakat(variante, {
            locale: 'de-DE',
            impressum: { art: 'visdp', name: 'A', anschrift: 'B' },
          })
        ).success
      ).toBe(false);
    }
  });

  it('gives the overlay its Hellgrün box, and nothing else a stil', () => {
    expect(printSpecSchema.safeParse(plakat('overlay', { stil: 'hellgruen' })).success).toBe(true);
    expect(printSpecSchema.safeParse(plakat('geteilt', { stil: 'hellgruen' })).success).toBe(false);
  });

  it('needs the photo', () => {
    expect(
      printSpecSchema.safeParse(plakat('person', { slots: { headline: 'Ohne Foto' } })).success
    ).toBe(false);
  });
});

describe('printFotoSrc', () => {
  it('serves catalogue photos from the Vorlagen route and stock photos from the picker', () => {
    expect(printFotoSrc('vorlage:person.jpg')).toBe('/api/sharepic-vorlagen/assets/person.jpg');
    expect(printFotoSrc('wind-unsplash.jpg')).toBe(
      '/api/image-picker/stock-image/wind-unsplash.jpg'
    );
  });
});

describe('printImpressumSchema', () => {
  it('discriminates on art', () => {
    expect(printImpressumSchema.safeParse(visdp).success).toBe(true);
    expect(printImpressumSchema.safeParse(medien).success).toBe(true);
    expect(
      printImpressumSchema.safeParse({ art: 'visdp', medieninhaber: 'x', anschrift: 'y' }).success
    ).toBe(false);
    expect(
      printImpressumSchema.safeParse({ art: 'impressum', name: 'x', anschrift: 'y' }).success
    ).toBe(false);
  });
});
