import { describe, expect, it } from 'vitest';

import { printImpressumSchema, printSpecSchema } from './printCreator.js';

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
    expect(printSpecSchema.safeParse({ ...plakat, stil: 'klee' }).success).toBe(false);
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
