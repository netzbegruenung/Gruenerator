import { FORM_FIELD_KEYS, type BelegMeta, type ReisekostenFormMap } from '@gruenerator/contracts';
import { emptyReisekostenState } from '@gruenerator/shared/reisekosten';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { buildAbrechnungPdf, type AnhangDatei } from './buildAbrechnungPdf';

// A synthetic stand-in for the official form: the real one lives in the
// internal content repo. Two pages like the original, every field in its own
// row so the text that comes back can be attributed.
function fixtureMap(): ReisekostenFormMap {
  const fields = Object.fromEntries(
    FORM_FIELD_KEYS.map((k, i) => [k, { x: 50, y: 800 - i * 18, w: 300, h: 14, align: 'left' }])
  ) as ReisekostenFormMap['fields'];
  const col = (x: number) => ({ x, w: 60 });
  const row = (y: number) => ({ y, h: 14 });
  return {
    version: 'test',
    rateKey: 'de-DE/nrw',
    formPage: 0,
    fontSize: 9,
    fields,
    checkboxes: {
      lv_bezahlt: { x: 400, y: 100, w: 6, h: 6 },
      beleg: { x: 400, y: 90, w: 6, h: 6 },
      pauschal: { x: 400, y: 80, w: 6, h: 6 },
    },
    verpflegung: {
      columns: [col(360), col(420), col(480), col(540)],
      summe: col(360),
      rows: {
        eintaegig: row(60),
        anreise: row(48),
        zwischen: row(36),
        abreise: row(24),
        abzug: row(12),
      },
    },
    whiteouts: [],
  };
}

async function template(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  return doc.save();
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return out;
}

function claim() {
  const s = emptyReisekostenState();
  s.stammdaten = {
    ...s.stammdaten,
    name: 'Alex Beispiel',
    iban: 'DE89 3704 0044 0532 0130 00',
    plz: '40211',
    ort: 'Düsseldorf',
  };
  s.reise = {
    anlass: 'Länderrat',
    ziel: 'Berlin',
    reisebeginn: '2026-03-14T07:00',
    rueckkehr: '2026-03-14T22:30',
  };
  s.fahrt.bahn = { betrag: 87.4, belegVorhanden: true };
  return s;
}

const meta = (id: string): BelegMeta => ({
  id,
  dateiname: `${id}.pdf`,
  mimeType: 'application/pdf',
  groesse: 1,
  sha256: id,
  kategorie: 'db_ticket',
  betrag: 87.4,
  datum: null,
  von: null,
  nach: null,
  businessPackage: null,
  quelle: 'lokal',
});

describe('buildAbrechnungPdf', () => {
  it('draws the claim, incl. the browser-only bank details, onto the form page', async () => {
    const bytes = await buildAbrechnungPdf({
      template: await template(),
      map: fixtureMap(),
      state: claim(),
      optionen: { formular: true, hinweise: false, tagesaufstellung: false },
      anhaenge: [],
      heute: new Date('2026-03-20T12:00:00'),
    });
    const [form, ...rest] = await pageTexts(bytes);
    expect(rest).toHaveLength(0);
    expect(form).toContain('Alex Beispiel');
    expect(form).toContain('DE89 3704 0044 0532 0130 00');
    expect(form).toContain('40211 Düsseldorf');
    expect(form).toContain('87,40 €');
    // One-day trip over 8 h: 14 € meal allowance, total 101,40 €.
    expect(form).toContain('14,00 €');
    expect(form).toContain('101,40 €');
    expect(form).toContain('20.03.2026');
  });

  it('attaches belege after the form and stamps each with its line', async () => {
    const beleg = await PDFDocument.create();
    beleg.addPage([300, 300]);
    const anhaenge: AnhangDatei[] = [
      { meta: meta('ticket'), bytes: await beleg.save(), format: 'pdf' },
    ];
    const bytes = await buildAbrechnungPdf({
      template: await template(),
      map: fixtureMap(),
      state: claim(),
      optionen: { formular: true, hinweise: true, tagesaufstellung: false },
      anhaenge,
      heute: new Date(),
    });
    const texts = await pageTexts(bytes);
    expect(texts).toHaveLength(3);
    expect(texts[2]).toContain('Beleg 1 · 1.1 Bahn · DB-Ticket');
  });

  it('adds the day table only for trips longer than the four form columns', async () => {
    const s = claim();
    s.reise.reisebeginn = '2026-03-10T07:00';
    s.reise.rueckkehr = '2026-03-15T20:00';
    s.uebernachtung = { modus: 'pauschal', betrag: null, naechte: 5 };
    const bytes = await buildAbrechnungPdf({
      template: await template(),
      map: fixtureMap(),
      state: s,
      optionen: { formular: true, hinweise: false, tagesaufstellung: true },
      anhaenge: [],
      heute: new Date(),
    });
    const texts = await pageTexts(bytes);
    expect(texts).toHaveLength(2);
    expect(texts[1]).toContain('Tagesaufstellung');
  });
});
