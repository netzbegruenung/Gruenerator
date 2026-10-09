import fs from 'node:fs/promises';

import { type ExplainableContent } from '@gruenerator/contracts';

import { type PdfBlock, type PdfDocumentSpec } from '../pdf/pdfDocument.js';
import { renderPdf, type PdfLocale, type RenderPdfOptions } from '../pdf/pdfRenderer.js';

import { explainableImagePath } from './explainableRepository.js';

export const AI_IMAGE_NOTE =
  'Die Bilder wurden mit KI (FLUX) erzeugt und dienen nur der Veranschaulichung.';

export const imageRef = (sectionIndex: number): string => `section-${sectionIndex}`;

export function explainableToPdfSpec(
  content: ExplainableContent,
  locale: PdfLocale
): PdfDocumentSpec {
  const blocks: PdfBlock[] = [{ type: 'paragraph', text: content.summary }];
  let hasImage = false;

  content.sections.forEach((section, i) => {
    blocks.push({ type: 'heading', level: 2, text: section.heading });
    for (const text of section.paragraphs) blocks.push({ type: 'paragraph', text });
    if (section.image?.status === 'done') {
      hasImage = true;
      blocks.push({ type: 'image', ref: imageRef(i), alt: section.image.alt });
    }
  });

  blocks.push({ type: 'heading', level: 2, text: 'Das Wichtigste' });
  blocks.push({ type: 'list', items: content.keyTakeaways });

  if (content.glossary?.length) {
    blocks.push({ type: 'heading', level: 2, text: 'Begriffe' });
    blocks.push({
      type: 'keyvalue',
      entries: content.glossary.map((g) => ({ label: g.term, value: g.definition })),
    });
  }

  if (content.sources.length) {
    blocks.push({
      type: 'sources',
      title: 'Quellen',
      entries: content.sources.map((s) => ({
        label: `[${s.index}] ${s.title}`,
        value: s.url ?? '',
      })),
    });
  }

  if (hasImage) blocks.push({ type: 'note', text: AI_IMAGE_NOTE });

  return { title: content.title, kind: 'document', language: locale, blocks };
}

export async function renderExplainablePdf(
  id: string,
  content: ExplainableContent,
  locale: PdfLocale
): Promise<Buffer> {
  const spec = explainableToPdfSpec(content, locale);
  const images: NonNullable<RenderPdfOptions['images']> = new Map();
  await Promise.all(
    content.sections.map(async (section, i) => {
      if (section.image?.status !== 'done') return;
      try {
        images.set(imageRef(i), {
          bytes: await fs.readFile(explainableImagePath(id, i)),
          type: 'png',
        });
      } catch {
        // A missing file only drops its figure; the renderer skips unknown refs.
      }
    })
  );
  const rendered = await renderPdf(spec, { locale, images });
  return rendered.bytes;
}
