/**
 * Builds the Reisekosten PDF. The amounts are re-derived server-side from the
 * deterministic engine (authority) before drawing, so a tampered client total
 * can never reach the PDF.
 *
 * v1 renders a clean, self-contained A4 layout that mirrors the official form's
 * sections. To emit the pixel-exact official Landesverband form instead, drop
 * the original AcroForm/flat PDF at `assets/reisekosten/<lv>.pdf` and overlay
 * values via `page.drawText` at the field coordinates (same pdf-lib API).
 */
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { type ReisekostenState } from '@gruenerator/contracts';
import { computeReisekosten } from '@gruenerator/shared/reisekosten';
import fontkit from '@pdf-lib/fontkit';

import { createLogger } from '../../utils/logger.js';

import type { PDFFont, RGB } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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

export async function buildReisekostenPdf(state: ReisekostenState): Promise<Buffer> {
  const c = computeReisekosten(state);
  const { PDFDocument, rgb } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 48;

  const fontsDir = path.join(__dirname, '..', '..', 'public', 'fonts');
  const [titleBytes, regularBytes, boldBytes] = await Promise.all([
    fs.readFile(path.join(fontsDir, 'GrueneTypeNeue-Regular.ttf')),
    fs.readFile(path.join(fontsDir, 'PTSans-Regular.ttf')),
    fs.readFile(path.join(fontsDir, 'PTSans-Bold.ttf')),
  ]);
  const titleFont = await pdfDoc.embedFont(titleBytes);
  const font = await pdfDoc.embedFont(regularBytes);
  const bold = await pdfDoc.embedFont(boldBytes);

  const ink = rgb(0.15, 0.15, 0.15);
  const muted = rgb(0.4, 0.4, 0.4);
  const gruen = rgb(0.0, 0.36, 0.22);
  let y = height - margin;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { font?: PDFFont; size?: number; color?: RGB } = {},
  ) => {
    page.drawText(s, { x, y: yy, size: opts.size ?? 10, font: opts.font ?? font, color: opts.color ?? ink });
  };
  const right = (
    s: string,
    xRight: number,
    yy: number,
    opts: { font?: PDFFont; size?: number; color?: RGB } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(s, size);
    text(s, xRight - w, yy, opts);
  };
  const rowRight = width - margin;

  // ── Header ──
  text('Reisekostenabrechnung', margin, y, { font: titleFont, size: 22, color: gruen });
  right('BÜNDNIS 90 / DIE GRÜNEN', rowRight, y + 4, { font: bold, size: 11, color: gruen });
  y -= 12;
  right(state.rateKey, rowRight, y, { size: 8, color: muted });
  y -= 22;

  const line = (label: string, value: string, opts: { bold?: boolean } = {}) => {
    text(label, margin, y, { color: muted });
    text(value, margin + 130, y, { font: opts.bold ? bold : font });
    y -= 16;
  };
  const section = (title: string) => {
    y -= 6;
    text(title, margin, y, { font: bold, size: 12, color: gruen });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: rowRight, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 14;
  };
  const amount = (label: string, value: number, opts: { bold?: boolean } = {}) => {
    text(label, margin, y, { font: opts.bold ? bold : font, color: opts.bold ? ink : muted });
    right(EUR(value), rowRight, y, { font: opts.bold ? bold : font });
    y -= 16;
  };

  // ── Antragsteller ──
  section('Antragsteller*in');
  line('Name', state.stammdaten.name || '—');
  if (state.stammdaten.funktion) line('Funktion', state.stammdaten.funktion);
  line('Anschrift', `${state.stammdaten.strasse} ${state.stammdaten.hausnr}, ${state.stammdaten.plz} ${state.stammdaten.ort}`);
  line('E-Mail', state.stammdaten.email || '—');
  if (state.stammdaten.telefon) line('Telefon', state.stammdaten.telefon);

  // ── Reise ──
  section('Reise');
  line('Anlass', state.reise.anlass || '—');
  line('Ziel', state.reise.ziel || '—');
  line('Reisebeginn', fmtDateTime(state.reise.reisebeginn));
  line('Rückkehr', fmtDateTime(state.reise.rueckkehr));

  // ── Fahrtkosten ──
  section('1. Fahrtkosten');
  if (c.fahrtkosten.bahn) amount('Bahn', c.fahrtkosten.bahn);
  if (c.fahrtkosten.oepnv) amount('ÖPNV', c.fahrtkosten.oepnv);
  if (c.fahrtkosten.kfz) amount('Kfz', c.fahrtkosten.kfz);
  if (c.fahrtkosten.miete) amount('Miete / Carsharing', c.fahrtkosten.miete);
  if (c.fahrtkosten.taxi) amount('Taxi', c.fahrtkosten.taxi);
  if (c.fahrtkosten.sonstiges) amount('Sonstiges', c.fahrtkosten.sonstiges);
  amount('Summe Fahrtkosten', c.fahrtkosten.summe, { bold: true });

  // ── Verpflegung ──
  section('2. Verpflegungsmehraufwand');
  for (const t of c.verpflegung.tage) {
    const label = `${t.datum} · ${TAG_LABEL[t.typ] ?? t.typ}${t.abzug ? ` (Abzug ${EUR(t.abzug)})` : ''}`;
    amount(label, t.summe);
  }
  amount('Summe Verpflegung', c.verpflegung.summe, { bold: true });

  // ── Übernachtung ──
  if (state.uebernachtung) {
    section('3. Übernachtung');
    amount('Summe Übernachtung', c.uebernachtung.summe, { bold: true });
  }

  // ── Gesamt ──
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: rowRight, y },
    thickness: 1,
    color: gruen,
  });
  y -= 18;
  amount('Gesamtbetrag', c.gesamt, { bold: true });
  if (c.spende) {
    amount('Davon Spende an BÜNDNIS 90 / DIE GRÜNEN', c.spende);
    amount('Auszahlungsbetrag', c.auszahlung, { bold: true });
  }

  // ── Bankverbindung ──
  y -= 10;
  text(`IBAN: ${state.stammdaten.iban || '—'}${state.stammdaten.bic ? `   BIC: ${state.stammdaten.bic}` : ''}`, margin, y, {
    size: 9,
    color: muted,
  });

  const bytes = await pdfDoc.save();
  log.info(`[reisekosten] PDF built (${bytes.length} bytes), gesamt=${c.gesamt}`);
  return Buffer.from(bytes);
}
