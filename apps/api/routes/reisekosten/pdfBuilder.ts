/**
 * Builds the Reisekosten PDF. The amounts are re-derived server-side from the
 * deterministic engine (authority) before drawing, so a tampered client total
 * can never reach the PDF.
 *
 * Goes through the shared block renderer (`services/pdf/pdfRenderer`) rather
 * than drawing on pdf-lib directly. The hand-positioned predecessor marched a
 * single `y` down one fixed A4 page: a long trip with many Verpflegungstage ran
 * off the bottom and silently lost rows. The renderer paginates, and its output
 * is tagged (PDF/UA) — a Reisekostenabrechnung is a document people submit, so
 * a screen reader has to be able to read it back.
 */
import { type ReisekostenState } from '@gruenerator/contracts';
import { computeReisekosten } from '@gruenerator/shared/reisekosten';

import { type PdfBlock, type PdfDocumentSpec } from '../../services/pdf/pdfDocument.js';
import { renderPdf, type PdfLocale } from '../../services/pdf/pdfRenderer.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('reisekostenPdf');

const EUR = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TAG_LABEL: Record<string, string> = {
  eintaegig: 'Eintägige Reise',
  anreise: 'Anreisetag',
  zwischen: 'Zwischentag',
  abreise: 'Abreisetag',
};

/**
 * `rateKey` carries the locale of the rate set it belongs to (`de-DE/nrw`), so
 * an AT rate set later picks the AT theme without another switch here.
 */
function localeFromRateKey(rateKey: string): PdfLocale {
  return rateKey.startsWith('de-AT') ? 'de-AT' : 'de-DE';
}

export async function buildReisekostenPdf(state: ReisekostenState): Promise<Buffer> {
  const c = computeReisekosten(state);
  const { stammdaten, reise } = state;

  const blocks: PdfBlock[] = [];

  blocks.push({ type: 'heading', level: 2, text: 'Antragsteller*in' });
  blocks.push({
    type: 'keyvalue',
    entries: [
      { label: 'Name', value: stammdaten.name || '—' },
      ...(stammdaten.funktion ? [{ label: 'Funktion', value: stammdaten.funktion }] : []),
      {
        label: 'Anschrift',
        value: `${stammdaten.strasse} ${stammdaten.hausnr}, ${stammdaten.plz} ${stammdaten.ort}`,
      },
      { label: 'E-Mail', value: stammdaten.email || '—' },
      ...(stammdaten.telefon ? [{ label: 'Telefon', value: stammdaten.telefon }] : []),
    ],
  });

  blocks.push({ type: 'heading', level: 2, text: 'Reise' });
  blocks.push({
    type: 'keyvalue',
    entries: [
      { label: 'Anlass', value: reise.anlass || '—' },
      { label: 'Ziel', value: reise.ziel || '—' },
      { label: 'Reisebeginn', value: fmtDateTime(reise.reisebeginn) },
      { label: 'Rückkehr', value: fmtDateTime(reise.rueckkehr) },
    ],
  });

  // Nur besetzte Posten auflisten — eine Zeile "Taxi 0,00 €" liest sich wie ein
  // vergessener Beleg.
  const fahrtPosten: Array<{ label: string; value: number }> = [
    { label: 'Bahn', value: c.fahrtkosten.bahn },
    { label: 'ÖPNV', value: c.fahrtkosten.oepnv },
    { label: 'Kfz', value: c.fahrtkosten.kfz },
    { label: 'Miete / Carsharing', value: c.fahrtkosten.miete },
    { label: 'Taxi', value: c.fahrtkosten.taxi },
    { label: 'Sonstiges', value: c.fahrtkosten.sonstiges },
  ].filter((p) => p.value !== 0);

  blocks.push({ type: 'heading', level: 2, text: '1. Fahrtkosten' });
  blocks.push({
    type: 'keyvalue',
    entries: [
      ...fahrtPosten.map((p) => ({ label: p.label, value: EUR(p.value) })),
      { label: 'Summe Fahrtkosten', value: EUR(c.fahrtkosten.summe) },
    ],
  });

  blocks.push({ type: 'heading', level: 2, text: '2. Verpflegungsmehraufwand' });
  if (c.verpflegung.tage.length) {
    // Tabelle statt keyvalue: die Tage sind echte Datensätze mit gleichen
    // Spalten, und der Abzug steht als eigene Spalte statt in Klammern im
    // Label — vorlesbar und beim Prüfen nachvollziehbar. keyvalue deckelt
    // ausserdem bei 60 Einträgen, die Tabelle bei 200 Zeilen.
    blocks.push({
      type: 'table',
      columns: ['Datum', 'Art', 'Abzug', 'Betrag'],
      rows: c.verpflegung.tage.map((t) => [
        t.datum,
        TAG_LABEL[t.typ] ?? t.typ,
        t.abzug ? EUR(t.abzug) : '—',
        EUR(t.summe),
      ]),
    });
  }
  blocks.push({
    type: 'keyvalue',
    entries: [{ label: 'Summe Verpflegung', value: EUR(c.verpflegung.summe) }],
  });

  if (state.uebernachtung) {
    blocks.push({ type: 'heading', level: 2, text: '3. Übernachtung' });
    blocks.push({
      type: 'keyvalue',
      entries: [{ label: 'Summe Übernachtung', value: EUR(c.uebernachtung.summe) }],
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'keyvalue',
    entries: [
      { label: 'Gesamtbetrag', value: EUR(c.gesamt) },
      ...(c.spende
        ? [
            { label: 'Davon Spende an BÜNDNIS 90 / DIE GRÜNEN', value: EUR(c.spende) },
            { label: 'Auszahlungsbetrag', value: EUR(c.auszahlung) },
          ]
        : []),
    ],
  });

  blocks.push({ type: 'heading', level: 2, text: 'Bankverbindung' });
  blocks.push({
    type: 'keyvalue',
    entries: [
      { label: 'IBAN', value: stammdaten.iban || '—' },
      ...(stammdaten.bic ? [{ label: 'BIC', value: stammdaten.bic }] : []),
    ],
  });

  const locale = localeFromRateKey(state.rateKey);
  const spec: PdfDocumentSpec = {
    title: 'Reisekostenabrechnung',
    subtitle: `Sätze: ${state.rateKey}`,
    kind: 'document',
    language: locale,
    blocks,
  };

  const rendered = await renderPdf(spec, { locale, sender: null });

  if (rendered.missingGlyphs.length) {
    log.warn(
      `[reisekosten] ${rendered.droppedGlyphCount} Zeichen ohne Glyphe entfernt: ${rendered.missingGlyphs.join(' ')}`
    );
  }
  log.info(`[reisekosten] PDF built (${rendered.bytes.length} bytes), gesamt=${c.gesamt}`);
  return rendered.bytes;
}
