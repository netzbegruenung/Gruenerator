/**
 * Draws a claim onto the official form. The form has no AcroForm fields, so
 * every value goes to measured coordinates from the field map (kept next to
 * the PDF in the internal content repo). Runs in the browser: bank details and
 * address are drawn here and never leave the device.
 */
import { getRate } from '@gruenerator/shared/reisekosten';
import { rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';

import type {
  ComputeResult,
  FormField,
  ReisekostenFormMap,
  ReisekostenState,
  VerpflegungTag,
} from '@gruenerator/contracts';

const MIN_FONT_SIZE = 5;
const PADDING = 2;

export function formatEuro(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatKm(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/** `2026-03-14T07:30` → `14.03.2026` / `07:30`; empty when unparsable. */
function splitDateTime(iso: string): { datum: string; zeit: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return { datum: '', zeit: '' };
  const [, y, mo, d, h, mi] = m;
  return { datum: `${d}.${mo}.${y}`, zeit: h && mi ? `${h}:${mi}` : '' };
}

export function formatDatum(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Standard fonts only encode WinAnsi; anything else becomes "?" instead of throwing. */
export function encodable(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.replace(/\s+/g, ' ')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawInBox(
  page: PDFPage,
  font: PDFFont,
  text: string,
  box: Box,
  align: FormField['align'],
  size: number
): void {
  const value = encodable(font, text).trim();
  if (!value) return;
  const maxWidth = box.w - 2 * PADDING;
  let fontSize = size;
  while (fontSize > MIN_FONT_SIZE && font.widthOfTextAtSize(value, fontSize) > maxWidth) {
    fontSize -= 0.5;
  }
  const width = font.widthOfTextAtSize(value, fontSize);
  const x =
    align === 'right'
      ? box.x + box.w - PADDING - width
      : align === 'center'
        ? box.x + (box.w - width) / 2
        : box.x + PADDING;
  const y = box.y + (box.h - fontSize * 0.7) / 2;
  page.drawText(value, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
}

/** Text per field key; a missing key stays blank on the form. */
type FieldValues = Partial<Record<keyof ReisekostenFormMap['fields'], string>>;

function fieldValues(state: ReisekostenState, c: ComputeResult, heute: Date): FieldValues {
  const { stammdaten: s, reise, fahrt, uebernachtung } = state;
  const rate = getRate(state.rateKey);
  const beginn = splitDateTime(reise.reisebeginn);
  const rueckkehr = splitDateTime(reise.rueckkehr);
  const v: FieldValues = {
    name: s.name,
    funktion: s.funktion ?? '',
    wahlBeschlussVom: s.wahlBeschlussVom ?? '',
    strasse: s.strasse,
    hausnr: s.hausnr,
    email: s.email,
    plzOrt: [s.plz, s.ort].filter(Boolean).join(' '),
    telefon: s.telefon ?? '',
    iban: s.iban,
    bic: s.bic ?? '',
    anlass: reise.anlass,
    ziel: reise.ziel,
    beginnDatum: beginn.datum,
    beginnZeit: beginn.zeit,
    rueckkehrDatum: rueckkehr.datum,
    rueckkehrZeit: rueckkehr.zeit,
    summeFahrtkosten: formatEuro(c.fahrtkosten.summe),
    summeVerpflegung: formatEuro(c.verpflegung.summe),
    summeUebernachtung: formatEuro(c.uebernachtung.summe),
    gesamtbetrag: formatEuro(c.gesamt),
    spende: c.spende > 0 ? formatEuro(c.spende) : '',
    auszahlung: formatEuro(c.auszahlung),
    datum: formatDatum(heute),
  };

  if (c.fahrtkosten.bahn > 0) v.bahn = formatEuro(c.fahrtkosten.bahn);
  if (c.fahrtkosten.oepnv > 0) v.oepnv = formatEuro(c.fahrtkosten.oepnv);
  if (c.fahrtkosten.miete > 0) v.miete = formatEuro(c.fahrtkosten.miete);
  if (c.fahrtkosten.taxi > 0) v.taxi = formatEuro(c.fahrtkosten.taxi);
  if (c.fahrtkosten.sonstiges > 0) v.sonstiges = formatEuro(c.fahrtkosten.sonstiges);

  // 1.3 splits what `computeKfz` sums: Pkw up to the cap, the Mehr-km with a
  // Vorstandsbeschluss on their own row, other vehicles on the third row.
  const kfz = fahrt.kfz;
  if (kfz && kfz.km > 0) {
    if (kfz.fahrzeug === 'motorrad') {
      const km = kfz.vorstandsbeschluss ? kfz.km : Math.min(kfz.km, rate.kmObergrenze);
      v.kradKm = formatKm(km);
      v.kradBetrag = formatEuro(km * rate.kmSatzMotorrad);
    } else {
      const basis = Math.min(kfz.km, rate.kmObergrenze);
      v.kfzKm = formatKm(basis);
      v.kfzBetrag = formatEuro(basis * rate.kmSatzPkw);
      const mehr = kfz.km - basis;
      if (kfz.vorstandsbeschluss && mehr > 0) {
        v.kfzMehrKm = formatKm(mehr);
        v.kfzMehrBetrag = formatEuro(mehr * rate.kmSatzPkw);
      }
    }
  }

  if (uebernachtung?.modus === 'beleg') {
    v.uebernachtungBeleg = formatEuro(c.uebernachtung.summe);
  } else if (uebernachtung?.modus === 'pauschal') {
    v.naechte = String(uebernachtung.naechte ?? 0);
    v.uebernachtungPauschal = formatEuro(c.uebernachtung.summe);
  }
  return v;
}

/** Number of day columns on the form; later days are summed into the last one. */
export const FORM_TAGE = 4;

function drawVerpflegung(
  page: PDFPage,
  font: PDFFont,
  grid: ReisekostenFormMap['verpflegung'],
  tage: VerpflegungTag[]
): void {
  type Row = keyof typeof grid.rows;
  const cells = new Map<string, number>();
  const sums = new Map<Row, number>();
  const add = (row: Row, col: number, amount: number) => {
    cells.set(`${row}:${col}`, (cells.get(`${row}:${col}`) ?? 0) + amount);
    sums.set(row, (sums.get(row) ?? 0) + amount);
  };
  tage.forEach((tag, i) => {
    const col = Math.min(i, FORM_TAGE - 1);
    add(tag.typ, col, tag.basis);
    if (tag.abzug > 0) add('abzug', col, -tag.abzug);
  });

  for (const [key, amount] of cells) {
    const [row = 'abzug', col = '0'] = key.split(':') as [Row, string];
    const column = grid.columns[Number(col)];
    if (!column) continue;
    drawInBox(page, font, formatEuro(amount), { ...column, ...grid.rows[row] }, 'right', 7);
  }
  for (const [row, amount] of sums) {
    drawInBox(page, font, formatEuro(amount), { ...grid.summe, ...grid.rows[row] }, 'right', 8);
  }
}

export async function fillForm(
  pdf: PDFDocument,
  map: ReisekostenFormMap,
  state: ReisekostenState,
  computed: ComputeResult,
  heute: Date
): Promise<void> {
  const page = pdf.getPage(map.formPage);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const box of map.whiteouts) {
    page.drawRectangle({ ...box, width: box.w, height: box.h, color: rgb(1, 1, 1) });
  }

  const values = fieldValues(state, computed, heute);
  for (const [key, field] of Object.entries(map.fields) as Array<
    [keyof ReisekostenFormMap['fields'], FormField]
  >) {
    const value = values[key];
    if (value) drawInBox(page, font, value, field, field.align, map.fontSize);
  }

  drawVerpflegung(page, font, map.verpflegung, computed.verpflegung.tage);

  if (state.uebernachtung) {
    const box = map.checkboxes[state.uebernachtung.modus];
    drawInBox(page, font, 'X', { ...box, x: box.x - 1, w: box.w + 2 }, 'center', 8);
  }
}

const TAG_LABEL: Record<VerpflegungTag['typ'], string> = {
  eintaegig: 'Eintägig',
  anreise: 'Anreisetag',
  zwischen: 'Zwischentag',
  abreise: 'Abreisetag',
};

/**
 * A plain day-by-day table for trips longer than the form's four columns, so
 * the reviewer can follow how the summed fourth column came about.
 */
export async function addTagesaufstellung(pdf: PDFDocument, tage: VerpflegungTag[]): Promise<void> {
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText('Anlage: Verpflegungsmehraufwand – Tagesaufstellung', {
    x: 50,
    y: 790,
    size: 13,
    font: bold,
  });
  const cols = [50, 140, 260, 360, 460];
  const header = ['Datum', 'Art', 'Pauschale', 'Abzug', 'Betrag'];
  header.forEach((h, i) => page.drawText(h, { x: cols[i] ?? 50, y: 760, size: 9, font: bold }));
  let y = 742;
  for (const tag of tage) {
    const row = [
      splitDateTime(tag.datum).datum,
      TAG_LABEL[tag.typ],
      formatEuro(tag.basis),
      tag.abzug > 0 ? `– ${formatEuro(tag.abzug)}` : '',
      formatEuro(tag.summe),
    ];
    row.forEach((t, i) => page.drawText(t, { x: cols[i] ?? 50, y, size: 9, font }));
    y -= 16;
  }
  const summe = tage.reduce((acc, t) => acc + t.summe, 0);
  page.drawText('Summe Verpflegung', { x: 50, y: y - 6, size: 9, font: bold });
  page.drawText(formatEuro(summe), { x: 460, y: y - 6, size: 9, font: bold });
}

/** Greedy word wrap to `maxWidth`; keeps the user's line breaks and splits overlong words. */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const absatz of text.split(/\r?\n/)) {
    let line = '';
    for (const word of encodable(font, absatz).split(' ')) {
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        if (line) lines.push(line);
        line = '';
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      const next = line ? `${line} ${rest}` : rest;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next;
      } else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The form has no field for remarks, so they get a page of their own: the
 * general note first, then each attached beleg's comment under its number.
 */
export async function addAnmerkungen(
  pdf: PDFDocument,
  anmerkungen: string,
  belegKommentare: ReadonlyArray<{ titel: string; text: string }>
): Promise<void> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size = 10;
  const leading = 14;
  const left = 50;
  const maxWidth = 595.28 - 2 * left;
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const draw = (text: string, f: PDFFont, s: number, gap = leading) => {
    if (y < 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
    }
    page.drawText(text, { x: left, y, size: s, font: f });
    y -= gap;
  };

  draw('Anlage: Anmerkungen zur Abrechnung', bold, 13, 28);
  if (anmerkungen.trim()) {
    for (const line of wrapText(font, anmerkungen.trim(), size, maxWidth)) draw(line, font, size);
    y -= leading;
  }
  if (belegKommentare.length > 0) {
    draw('Kommentare zu den Belegen', bold, 11, 20);
    for (const k of belegKommentare) {
      draw(encodable(bold, k.titel), bold, size);
      for (const line of wrapText(font, k.text.trim(), size, maxWidth)) draw(line, font, size);
      y -= 6;
    }
  }
}
