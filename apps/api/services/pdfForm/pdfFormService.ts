/**
 * Reading and filling PDF AcroForm fields.
 *
 * Scope is deliberately AcroForm-only: a PDF either carries interactive form
 * fields or it does not. Flat/scanned forms (a large share of German public
 * administration) have no fields to address and are reported as such rather
 * than guessed at — overlaying values at measured coordinates is a separate,
 * per-form effort (see the note in routes/reisekosten/pdfBuilder.ts).
 *
 * pdf-lib is already an API dependency (exports/pdfController, reisekosten);
 * this module is the first use of its form API.
 */
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import fontkit from '@pdf-lib/fontkit';

import { createLogger } from '../../utils/logger.js';

import type { PDFDocument, PDFFont } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const log = createLogger('pdfForm');

type PdfFormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist';

export interface PdfFormField {
  name: string;
  type: PdfFormFieldType;
  /** Selectable values for radio/dropdown/optionlist — the ONLY accepted inputs
   *  for those types. Empty for text and checkbox. */
  options: string[];
  /** Current content, so the model can tell "already filled" from "empty". */
  value: string | null;
  readOnly: boolean;
}

export interface FillResult {
  bytes: Buffer;
  /** Fields actually written, in input order. */
  filled: string[];
  /** Field name → why it was skipped. Surfaced to the model so it can correct
   *  itself instead of reporting a success that did not happen. */
  skipped: Record<string, string>;
}

/** Checkbox inputs that mean "tick it". Everything else unticks. */
const TRUTHY = new Set(['true', 'ja', 'yes', 'x', '1', 'on', 'checked', 'wahr']);

/**
 * Embedding a real font is required, not cosmetic: pdf-lib's default
 * WinAnsi-encoded Helvetica throws on characters outside its charset when
 * appearances are regenerated, so any Umlaut in a filled value would abort the
 * whole fill. PTSans ships with the API for the export/reisekosten builders.
 */
async function embedFormFont(pdfDoc: PDFDocument): Promise<PDFFont | null> {
  try {
    pdfDoc.registerFontkit(fontkit);
    const bytes = await fs.readFile(
      path.join(__dirname, '..', '..', 'public', 'fonts', 'PTSans-Regular.ttf')
    );
    return await pdfDoc.embedFont(bytes, { subset: true });
  } catch (error) {
    log.warn(`[pdfForm] Font embedding failed, falling back to the default font: ${String(error)}`);
    return null;
  }
}

async function loadDocument(bytes: Buffer): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  // Many real-world forms are flagged encrypted with an empty owner password;
  // refusing them outright would reject files that fill perfectly well.
  return await PDFDocument.load(bytes, { ignoreEncryption: true });
}

/**
 * The form's fields, or an empty array when the PDF has no AcroForm at all.
 * Never throws for a readable PDF — "no fields" is a normal answer.
 */
export async function readFormFields(bytes: Buffer): Promise<PdfFormField[]> {
  const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } =
    await import('pdf-lib');
  const pdfDoc = await loadDocument(bytes);
  const form = pdfDoc.getForm();

  return form.getFields().map((field): PdfFormField => {
    const name = field.getName();
    const readOnly = field.isReadOnly();

    if (field instanceof PDFTextField) {
      return { name, type: 'text', options: [], value: field.getText() ?? null, readOnly };
    }
    if (field instanceof PDFCheckBox) {
      return {
        name,
        type: 'checkbox',
        options: [],
        value: field.isChecked() ? 'true' : 'false',
        readOnly,
      };
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name,
        type: 'radio',
        options: field.getOptions(),
        value: field.getSelected() ?? null,
        readOnly,
      };
    }
    if (field instanceof PDFDropdown) {
      return {
        name,
        type: 'dropdown',
        options: field.getOptions(),
        value: field.getSelected()[0] ?? null,
        readOnly,
      };
    }
    if (field instanceof PDFOptionList) {
      return {
        name,
        type: 'optionlist',
        options: field.getOptions(),
        value: field.getSelected()[0] ?? null,
        readOnly,
      };
    }
    // Signature fields and anything exotic: listed so the model sees the full
    // form, but not fillable.
    return { name, type: 'text', options: [], value: null, readOnly: true };
  });
}

/**
 * Write `values` into the form. Unknown names, read-only fields and values
 * outside a field's option set are skipped with a reason rather than throwing —
 * one bad key must not lose the other twenty correct ones.
 *
 * `flatten` (default true) bakes the values into the page content so the result
 * is a finished document; pass false to hand back a still-editable form.
 */
export async function fillFormFields(
  bytes: Buffer,
  values: Record<string, string>,
  opts: { flatten?: boolean } = {}
): Promise<FillResult> {
  const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } =
    await import('pdf-lib');
  const pdfDoc = await loadDocument(bytes);
  const form = pdfDoc.getForm();
  const font = await embedFormFont(pdfDoc);

  const filled: string[] = [];
  const skipped: Record<string, string> = {};

  for (const [name, rawValue] of Object.entries(values)) {
    const value = String(rawValue ?? '');
    let field;
    try {
      field = form.getField(name);
    } catch {
      skipped[name] = 'Feld existiert nicht in diesem Formular';
      continue;
    }
    if (field.isReadOnly()) {
      skipped[name] = 'Feld ist schreibgeschützt';
      continue;
    }

    try {
      if (field instanceof PDFTextField) {
        field.setText(value);
      } else if (field instanceof PDFCheckBox) {
        if (TRUTHY.has(value.trim().toLowerCase())) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown) {
        const match = field
          .getOptions()
          .find((o) => o.toLowerCase() === value.trim().toLowerCase());
        if (match == null) {
          skipped[name] = `Wert nicht auswählbar. Erlaubt: ${field.getOptions().join(', ')}`;
          continue;
        }
        field.select(match);
      } else if (field instanceof PDFOptionList) {
        const match = field
          .getOptions()
          .find((o) => o.toLowerCase() === value.trim().toLowerCase());
        if (match == null) {
          skipped[name] = `Wert nicht auswählbar. Erlaubt: ${field.getOptions().join(', ')}`;
          continue;
        }
        field.select(match);
      } else {
        skipped[name] = 'Feldtyp kann nicht ausgefüllt werden';
        continue;
      }
      filled.push(name);
    } catch (error) {
      skipped[name] = error instanceof Error ? error.message : String(error);
    }
  }

  // Appearances must be regenerated with the embedded font BEFORE flattening,
  // otherwise the flattened page keeps the viewer-generated (or missing)
  // appearance streams and the values are invisible in some readers.
  if (font) form.updateFieldAppearances(font);
  if (opts.flatten !== false) form.flatten();

  const saved = await pdfDoc.save();
  log.info(`[pdfForm] Filled ${filled.length} field(s), skipped ${Object.keys(skipped).length}`);
  return { bytes: Buffer.from(saved), filled, skipped };
}
