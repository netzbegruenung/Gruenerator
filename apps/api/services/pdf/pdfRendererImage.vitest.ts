import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { explainableToPdfSpec, AI_IMAGE_NOTE } from '../explainables/explainablePdf.js';

import { pdfDocumentFromModelSchema, type PdfDocumentSpec } from './pdfDocument.js';
import { renderPdf } from './pdfRenderer.js';
import { verifyPdf } from './pdfVerification.js';

vi.setConfig({ testTimeout: 30_000 });

async function figures(bytes: Buffer): Promise<PDFDict[]> {
  const doc = await PDFDocument.load(bytes);
  const found: PDFDict[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    const resolved = node instanceof PDFRef ? doc.context.lookup(node) : node;
    if (resolved instanceof PDFArray) return resolved.asArray().forEach(visit);
    if (!(resolved instanceof PDFDict)) return;
    if (node instanceof PDFRef) {
      if (seen.has(node.toString())) return;
      seen.add(node.toString());
    }
    if (String(resolved.get(PDFName.of('S')) ?? '') === '/Figure') found.push(resolved);
    const kids = resolved.get(PDFName.of('K'));
    if (kids) visit(kids);
  };
  visit(doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict)?.get(PDFName.of('K')));
  return found;
}

const png = (): Promise<Buffer> =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: '#46962b' } })
    .png()
    .toBuffer();

const spec = (blocks: PdfDocumentSpec['blocks']): PdfDocumentSpec => ({
  title: 'Bildtest',
  kind: 'document',
  language: 'de-DE',
  blocks,
});

describe('image block', () => {
  it('draws the image inside a Figure carrying /Alt', async () => {
    const result = await renderPdf(
      spec([
        { type: 'paragraph', text: 'Vorher.' },
        { type: 'image', ref: 'a', alt: 'Ein Windrad auf einer Wiese', caption: 'Bild 1' },
      ]),
      { locale: 'de-DE', images: new Map([['a', { bytes: await png(), type: 'png' as const }]]) }
    );

    const found = await figures(result.bytes);
    expect(found).toHaveLength(1);
    const alt = found[0]!.get(PDFName.of('Alt'));
    expect(alt instanceof PDFHexString && alt.decodeText()).toBe('Ein Windrad auf einer Wiese');
    expect((await verifyPdf(result.bytes)).problems).toEqual([]);
  });

  it('skips an image whose ref has no bytes', async () => {
    const result = await renderPdf(
      spec([
        { type: 'paragraph', text: 'Text.' },
        { type: 'image', ref: 'missing', alt: 'Fehlt' },
      ]),
      { locale: 'de-DE' }
    );
    expect(await figures(result.bytes)).toHaveLength(0);
  });

  it('is refused at the model gate', () => {
    const parsed = pdfDocumentFromModelSchema.safeParse({
      title: 'Modell',
      blocks: [{ type: 'image', ref: 'x', alt: 'y' }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('explainableToPdfSpec', () => {
  it('references only drawn images and adds the AI note', () => {
    const doc = explainableToPdfSpec(
      {
        title: 'Titel',
        summary: 'Zusammenfassung.',
        sections: [
          {
            heading: 'A',
            paragraphs: ['a'],
            image: { prompt: 'p', alt: 'Bild A', status: 'done' },
          },
          {
            heading: 'B',
            paragraphs: ['b'],
            image: { prompt: 'p', alt: 'Bild B', status: 'failed' },
          },
        ],
        keyTakeaways: ['eins', 'zwei'],
        glossary: [{ term: 'Begriff', definition: 'Erklärung' }],
        sources: [{ index: 1, title: 'Quelle', url: null }],
      },
      'de-AT'
    );
    const images = doc.blocks.filter((b) => b.type === 'image');
    expect(images).toEqual([{ type: 'image', ref: 'section-0', alt: 'Bild A' }]);
    expect(doc.blocks.at(-1)).toEqual({ type: 'note', text: AI_IMAGE_NOTE });
    expect(doc.language).toBe('de-AT');
    expect(doc.blocks.some((b) => b.type === 'heading' && b.text === 'Das Wichtigste')).toBe(true);
    expect(doc.blocks.some((b) => b.type === 'sources')).toBe(true);
  });
});
