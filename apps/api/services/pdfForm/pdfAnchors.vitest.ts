/**
 * Anchor detection on generated flat forms.
 *
 * The fixtures are built here on purpose, with the geometry MEASURED from the
 * real Detmold form (label 7pt, value beneath, 24pt row pitch, 10pt checkbox
 * squares left of their label). That makes the expected boxes computable, which
 * a downloaded form never is.
 *
 * What these tests can prove: the mechanics — row/column derivation, the
 * label-below rule, size filtering, prose rejection, page handling.
 * What they CANNOT prove: real-world hit rate. A generated form only contains
 * the structures I thought to draw; measuring against it is a closed loop. Hit
 * rate is assessed by rendering real forms with the boxes drawn on top.
 */
import { describe, it, expect } from 'vitest';

import { detectAnchorFields } from './pdfAnchors.js';

interface RowSpec {
  labels: Array<{ text: string; x: number }>;
}

async function buildFlatForm(
  rows: RowSpec[],
  opts: { checkboxes?: string[]; pages?: number; prose?: string[] } = {}
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const checkboxPng = await doc.embedPng(TINY_PNG);

  for (let p = 0; p < (opts.pages ?? 1); p++) {
    const page = doc.addPage([595, 842]);
    let y = 700;
    for (const row of rows) {
      for (const label of row.labels) {
        page.drawText(label.text, { x: label.x, y, size: 7, font, color: rgb(0.1, 0.1, 0.1) });
      }
      y -= 24;
    }
    // Checkbox squares are IMAGES in the real forms, so they are here too —
    // detection tracks image placements, not path geometry.
    for (const [i, label] of (opts.checkboxes ?? []).entries()) {
      const cy = y - 16 * i;
      page.drawImage(checkboxPng, { x: 61, y: cy, width: 10, height: 10 });
      page.drawText(label, { x: 76, y: cy + 2, size: 7, font });
    }
    // Prose is set larger, exactly as real forms do — the size filter is the
    // primary defence against it.
    let py = 200;
    for (const line of opts.prose ?? []) {
      page.drawText(line, { x: 61, y: py, size: 10, font });
      py -= 14;
    }
  }
  return Buffer.from(await doc.save());
}

/** 1x1 transparent PNG — stands in for the checkbox square graphic. */
const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
);

describe('detectAnchorFields', () => {
  it('puts the writable box BELOW the label, not beside it', async () => {
    // The German "Formularkasten" convention. Getting this backwards would put
    // every value in the wrong place on every form of this family.
    const pdf = await buildFlatForm([{ labels: [{ text: 'Vorname(n)', x: 61 }] }]);
    const [field] = await detectAnchorFields(pdf);

    expect(field.name).toBe('Vorname(n)');
    expect(field.box.y).toBeLessThan(700);
    expect(field.box.y + field.box.height).toBeLessThanOrEqual(700);
  });

  it('splits a two-column row at the next label, not at the page edge', async () => {
    const pdf = await buildFlatForm([
      {
        labels: [
          { text: 'Vorname(n)', x: 61 },
          { text: 'Name', x: 302 },
        ],
      },
    ]);
    const fields = await detectAnchorFields(pdf);
    const left = fields.find((f) => f.name === 'Vorname(n)')!;
    const right = fields.find((f) => f.name === 'Name')!;

    expect(left.x ?? left.box.x).toBeDefined();
    expect(left.box.x + left.box.width).toBeLessThan(302);
    expect(right.box.x).toBe(302);
  });

  it('does not let the last row run to the foot of the page', async () => {
    // Regression: with a row-based bottom edge the final label produced a box
    // several hundred points tall.
    const pdf = await buildFlatForm([{ labels: [{ text: 'Begründung', x: 61 }] }]);
    const [field] = await detectAnchorFields(pdf);

    expect(field.box.height).toBeLessThan(40);
  });

  it('bounds a box by the next label in its OWN column', async () => {
    // Columns rarely share row boundaries. Here the right column has no second
    // label, so a row-based rule would stretch its box down the whole page.
    const pdf = await buildFlatForm([
      {
        labels: [
          { text: 'Links oben', x: 61 },
          { text: 'Rechts allein', x: 302 },
        ],
      },
      { labels: [{ text: 'Links unten', x: 61 }] },
    ]);
    const fields = await detectAnchorFields(pdf);
    const right = fields.find((f) => f.name === 'Rechts allein')!;

    expect(right.box.height).toBeLessThan(40);
  });

  it('ignores prose set at a larger size', async () => {
    const pdf = await buildFlatForm([{ labels: [{ text: 'Straße', x: 61 }] }], {
      prose: [
        'Für die Änderung Ihres Meldestatus wenden Sie sich bitte an die',
        'Bürgerberatung oder an die Meldebehörde Ihres Hauptwohnsitzes.',
      ],
    });
    const fields = await detectAnchorFields(pdf);

    expect(fields.map((f) => f.name)).toContain('Straße');
    expect(fields.some((f) => f.name.includes('Meldestatus'))).toBe(false);
  });

  it('detects checkboxes and does not double-count their label as a text field', async () => {
    const pdf = await buildFlatForm([{ labels: [{ text: 'Familienstand', x: 61 }] }], {
      checkboxes: ['ledig', 'verheiratet'],
    });
    const fields = await detectAnchorFields(pdf);
    const boxes = fields.filter((f) => f.kind === 'checkbox');

    expect(boxes.map((b) => b.name).sort()).toEqual(['ledig', 'verheiratet']);
    // Each tick label belongs to its square, never also to a text box.
    expect(fields.filter((f) => f.name === 'ledig')).toHaveLength(1);
    expect(boxes[0].box.width).toBeCloseTo(10, 0);
  });

  it('reports anchors per page with the right page number', async () => {
    const pdf = await buildFlatForm([{ labels: [{ text: 'Vorname(n)', x: 61 }] }], { pages: 3 });
    const fields = await detectAnchorFields(pdf);

    expect(new Set(fields.map((f) => f.box.page))).toEqual(new Set([1, 2, 3]));
  });

  it('returns nothing for a page without a text layer', async () => {
    // Pure scans have no anchors — the caller must fall back to saying so.
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    await expect(detectAnchorFields(Buffer.from(await doc.save()))).resolves.toEqual([]);
  });
});
