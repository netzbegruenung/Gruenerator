import { describe, it, expect, beforeAll } from 'vitest';

import { readFormFields, fillFormFields } from './pdfFormService.js';

/**
 * Fixtures are BUILT with pdf-lib rather than committed as binaries: the round
 * trip (create → read → fill → re-read) is exactly what the service promises,
 * and a generated form stays readable in review.
 */
async function buildFormPdf(): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();

  const name = form.createTextField('antragsteller.name');
  name.addToPage(page, { x: 50, y: 320, width: 300, height: 20 });

  const check = form.createCheckBox('einverstanden');
  check.addToPage(page, { x: 50, y: 280, width: 15, height: 15 });

  const radio = form.createRadioGroup('anrede');
  radio.addOptionToPage('Frau', page, { x: 50, y: 240, width: 15, height: 15 });
  radio.addOptionToPage('Herr', page, { x: 100, y: 240, width: 15, height: 15 });

  const dropdown = form.createDropdown('bundesland');
  dropdown.addOptions(['Bayern', 'Berlin']);
  dropdown.addToPage(page, { x: 50, y: 200, width: 200, height: 20 });

  const locked = form.createTextField('aktenzeichen');
  locked.setText('AZ-2026-1');
  locked.enableReadOnly();
  locked.addToPage(page, { x: 50, y: 160, width: 200, height: 20 });

  return Buffer.from(await pdfDoc.save());
}

/**
 * A form whose widgets have a zero-size rectangle. This is not a synthetic
 * edge case: the Detmold "Erklärung zur Zweitwohnungssteuer" (MACH
 * formsolutions, a generator used across German municipal administration) ships
 * 53 fields that ALL look like this. Writing to them succeeds and reads back
 * correctly, and the resulting document is completely blank.
 */
async function buildZeroRectPdf(): Promise<Buffer> {
  const { PDFDocument, PDFName, PDFNumber, PDFArray } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();
  const field = form.createTextField('unsichtbar');
  field.addToPage(page, { x: 50, y: 300, width: 200, height: 20 });

  const zero = PDFArray.withContext(pdfDoc.context);
  for (let i = 0; i < 4; i++) zero.push(PDFNumber.of(0));
  for (const widget of (
    field as unknown as {
      acroField: { getWidgets(): Array<{ dict: { set(k: unknown, v: unknown): void } }> };
    }
  ).acroField.getWidgets()) {
    widget.dict.set(PDFName.of('Rect'), zero);
  }
  return Buffer.from(await pdfDoc.save());
}

async function buildFlatPdf(): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([600, 400]).drawText('Kein Formular, nur Text');
  return Buffer.from(await pdfDoc.save());
}

describe('pdfFormService', () => {
  let formPdf: Buffer;

  beforeAll(async () => {
    formPdf = await buildFormPdf();
  });

  it('reads every field with its type, options and read-only flag', async () => {
    const fields = await readFormFields(formPdf);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(fields).toHaveLength(5);
    expect(byName['antragsteller.name'].type).toBe('text');
    expect(byName['einverstanden'].type).toBe('checkbox');
    expect(byName['anrede'].type).toBe('radio');
    expect(byName['anrede'].options).toEqual(['Frau', 'Herr']);
    expect(byName['bundesland'].options).toEqual(['Bayern', 'Berlin']);
    expect(byName['aktenzeichen'].readOnly).toBe(true);
  });

  it('reports a flat PDF as having no fields instead of throwing', async () => {
    // The single most common real-world case — scanned public forms.
    await expect(readFormFields(await buildFlatPdf())).resolves.toEqual([]);
  });

  it('fills text, checkbox, radio and dropdown, and the values survive a re-read', async () => {
    const { bytes, filled, skipped } = await fillFormFields(
      formPdf,
      {
        'antragsteller.name': 'Grüne Kandidatin',
        einverstanden: 'ja',
        anrede: 'Frau',
        bundesland: 'Berlin',
      },
      { flatten: false }
    );

    expect(skipped).toEqual({});
    expect(filled).toHaveLength(4);

    const after = Object.fromEntries((await readFormFields(bytes)).map((f) => [f.name, f.value]));
    expect(after['antragsteller.name']).toBe('Grüne Kandidatin');
    expect(after['einverstanden']).toBe('true');
    expect(after['anrede']).toBe('Frau');
    expect(after['bundesland']).toBe('Berlin');
  });

  it('writes Umlauts — the default font would throw on them', async () => {
    // Regression guard for the embedded font: without it updateFieldAppearances
    // rejects any character outside WinAnsi and the whole fill aborts.
    const { bytes, skipped } = await fillFormFields(
      formPdf,
      { 'antragsteller.name': 'Jörg Müller-Straße größer' },
      { flatten: false }
    );
    expect(skipped).toEqual({});
    const after = await readFormFields(bytes);
    expect(after.find((f) => f.name === 'antragsteller.name')?.value).toBe(
      'Jörg Müller-Straße größer'
    );
  });

  it('skips unknown, read-only and out-of-range values with a reason, keeping the good ones', async () => {
    const { filled, skipped } = await fillFormFields(
      formPdf,
      {
        'antragsteller.name': 'Bleibt erhalten',
        gibtesnicht: 'x',
        aktenzeichen: 'AZ-neu',
        bundesland: 'Hamburg',
      },
      { flatten: false }
    );

    expect(filled).toEqual(['antragsteller.name']);
    expect(skipped['gibtesnicht']).toMatch(/existiert nicht/);
    expect(skipped['aktenzeichen']).toMatch(/schreibgeschützt/);
    expect(skipped['bundesland']).toMatch(/Bayern, Berlin/);
  });

  it('unticks a checkbox for any non-truthy value', async () => {
    const ticked = await fillFormFields(formPdf, { einverstanden: 'ja' }, { flatten: false });
    const unticked = await fillFormFields(
      ticked.bytes,
      { einverstanden: 'nein' },
      { flatten: false }
    );
    const after = await readFormFields(unticked.bytes);
    expect(after.find((f) => f.name === 'einverstanden')?.value).toBe('false');
  });

  it('marks zero-size widgets as not renderable and refuses to fill them', async () => {
    const pdf = await buildZeroRectPdf();

    const fields = await readFormFields(pdf);
    expect(fields).toHaveLength(1);
    expect(fields[0].renderable).toBe(false);

    const { filled, skipped } = await fillFormFields(pdf, { unsichtbar: 'wird nie sichtbar' });
    expect(filled).toEqual([]);
    expect(skipped['unsichtbar']).toMatch(/keine sichtbare Position/);
  });

  it('verifies the finished document really shows the values', async () => {
    // Second line of defence, independent of the renderability check: read the
    // saved PDF back and confirm the text is on the page. Against the real
    // Detmold form this reports the written value as missing, which is exactly
    // how the blank-output bug was caught.
    const { verification } = await fillFormFields(formPdf, {
      'antragsteller.name': 'SICHTBARKEITSPRUEFUNG',
    });
    expect(verification).toBeDefined();
    expect(verification?.visible).toBe(1);
    expect(verification?.missing).toEqual([]);
  });

  it('reports renderable for ordinary visible fields', async () => {
    const fields = await readFormFields(formPdf);
    expect(fields.filter((f) => f.renderable).length).toBeGreaterThan(0);
  });

  it('flattens by default so the result is a finished document', async () => {
    const { bytes } = await fillFormFields(formPdf, { 'antragsteller.name': 'Fertig' });
    // Flattening removes the AcroForm fields entirely.
    await expect(readFormFields(bytes)).resolves.toEqual([]);
  });
});
