/**
 * Assembles the download: the filled official form, optionally its notes page
 * and the day table, then the selected belege in form order. Everything runs
 * in the browser — the belege files are never uploaded for this.
 */
import {
  computeReisekosten,
  BELEG_KATEGORIEN,
  POSTEN_LABEL,
  postenOf,
} from '@gruenerator/shared/reisekosten';
import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';

import { addTagesaufstellung, fillForm, FORM_TAGE } from './fillForm';

import type { BelegMeta, ReisekostenFormMap, ReisekostenState } from '@gruenerator/contracts';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 36;

export interface ExportOptionen {
  formular: boolean;
  hinweise: boolean;
  tagesaufstellung: boolean;
}

/** A beleg ready to attach: PDF bytes, or an image already in PNG/JPEG. */
export interface AnhangDatei {
  meta: BelegMeta;
  bytes: Uint8Array;
  format: 'pdf' | 'png' | 'jpg';
}

export interface AbrechnungPdfInput {
  template: Uint8Array;
  map: ReisekostenFormMap;
  state: ReisekostenState;
  optionen: ExportOptionen;
  /** Already filtered to the selected belege and sorted in form order. */
  anhaenge: AnhangDatei[];
  heute: Date;
}

function anhangLabel(nr: number, meta: BelegMeta): string {
  return `Beleg ${nr} · ${POSTEN_LABEL[postenOf(meta)]} · ${BELEG_KATEGORIEN[meta.kategorie].label}`;
}

async function stamp(pdf: PDFDocument, page: PDFPage, text: string): Promise<void> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  page.drawText(text, { x: 12, y: height - 12, size: 7, font, color: rgb(0.35, 0.35, 0.35) });
}

async function appendBeleg(out: PDFDocument, anhang: AnhangDatei, nr: number): Promise<void> {
  const label = anhangLabel(nr, anhang.meta);
  if (anhang.format === 'pdf') {
    const src = await PDFDocument.load(anhang.bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) {
      out.addPage(page);
      await stamp(out, page, label);
    }
    return;
  }
  const image =
    anhang.format === 'png' ? await out.embedPng(anhang.bytes) : await out.embedJpg(anhang.bytes);
  const page = out.addPage(A4);
  const maxW = A4[0] - 2 * MARGIN;
  const maxH = A4[1] - 2 * MARGIN - 12;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (A4[0] - w) / 2, y: MARGIN + (maxH - h) / 2, width: w, height: h });
  await stamp(out, page, label);
}

export async function buildAbrechnungPdf(input: AbrechnungPdfInput): Promise<Uint8Array> {
  const { template, map, state, optionen, anhaenge, heute } = input;
  const out = await PDFDocument.create();
  const computed = computeReisekosten(state);

  if (optionen.formular || optionen.hinweise) {
    const form = await PDFDocument.load(template);
    if (optionen.formular) await fillForm(form, map, state, computed, heute);
    const indices = form
      .getPageIndices()
      .filter((i) => (i === map.formPage ? optionen.formular : optionen.hinweise));
    for (const page of await out.copyPages(form, indices)) out.addPage(page);
  }
  if (optionen.tagesaufstellung && computed.verpflegung.tage.length > FORM_TAGE) {
    await addTagesaufstellung(out, computed.verpflegung.tage);
  }

  let nr = 1;
  for (const anhang of anhaenge) await appendBeleg(out, anhang, nr++);

  out.setTitle(`Reisekostenabrechnung – ${state.reise.anlass || 'Reise'}`);
  out.setLanguage('de-DE');
  return out.save();
}
