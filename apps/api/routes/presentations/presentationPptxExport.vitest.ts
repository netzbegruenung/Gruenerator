import { type Slide } from '@gruenerator/contracts';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  asciiFilename,
  contentDispositionAttachment,
  exportPresentationToPptx,
  sanitizeFilename,
} from './presentationPptxExport.js';

/**
 * A pptx is a ZIP of OOXML. Byte-size deltas cannot tell a correct layout from
 * a wrong one, so the design assertions below read the slide XML directly.
 */
function slideXml(buf: Buffer, n = 1): string {
  return new AdmZip(buf).readAsText(`ppt/slides/slide${n}.xml`);
}

/** Text bodies (`<p:txBody>`) in document order — one entry per shape. */
function textBodies(xml: string): string[] {
  return [...xml.matchAll(/<p:txBody>([\s\S]*?)<\/p:txBody>/g)].map((m) => m[1]);
}

/** Visible text of a body, runs concatenated. */
function bodyText(body: string): string {
  return [...body.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('');
}

function slide(partial: Partial<Slide>): Slide {
  return {
    id: 'x',
    layout: 'content',
    title: '',
    body: '',
    notes: '',
    background: null,
    transition: null,
    fragments: false,
    autoAnimate: false,
    hidden: false,
    codeLanguage: null,
    variant: null,
    ...partial,
  };
}

describe('exportPresentationToPptx', () => {
  it('produces a non-empty PPTX (ZIP/OOXML) buffer across layouts', async () => {
    const buf = await exportPresentationToPptx(
      [
        slide({ layout: 'title', title: 'Deck', body: 'Untertitel', variant: 0 }),
        slide({ title: 'Punkte', body: '- **a**\n- b' }),
        slide({ layout: 'quote', title: '', body: 'Ein Zitat', variant: 0 }),
        slide({ layout: 'code', title: 'Beispiel', body: 'const x = 1;', codeLanguage: 'ts' }),
      ],
      'Meine Präsentation',
      '#316049'
    );
    expect(buf.length).toBeGreaterThan(0);
    // OOXML/pptx is a ZIP — starts with the local-file-header magic "PK\x03\x04".
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it.each(['de-DE', 'de-AT'] as const)('exports a valid deck with the %s brand', async (brand) => {
    const buf = await exportPresentationToPptx(
      [slide({ layout: 'title', title: 'Deck', body: 'Untertitel' }), slide({ title: 'Inhalt' })],
      'T',
      null,
      { brand, showLogo: true }
    );
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('produces different output for DE vs AT brands (fonts/colors/logo)', async () => {
    const slides = [slide({ layout: 'title', title: 'Deck', body: 'Untertitel' })];
    const de = await exportPresentationToPptx(slides, 'T', null, { brand: 'de-DE' });
    const at = await exportPresentationToPptx(slides, 'T', null, { brand: 'de-AT' });
    expect(de.equals(at)).toBe(false);
  });

  it('embeds the title-slide logo only when showLogo is on', async () => {
    const slides = [slide({ layout: 'title', title: 'Deck' })];
    const withLogo = await exportPresentationToPptx(slides, 'T', null, {
      brand: 'de-DE',
      showLogo: true,
    });
    const withoutLogo = await exportPresentationToPptx(slides, 'T', null, {
      brand: 'de-DE',
      showLogo: false,
    });
    // The embedded PNG dominates the archive size.
    expect(withLogo.length).toBeGreaterThan(withoutLogo.length + 1000);
  });

  it('omits hidden slides', async () => {
    const withHidden = await exportPresentationToPptx(
      [slide({ title: 'Sichtbar' }), slide({ title: 'Versteckt', hidden: true })],
      'T',
      null
    );
    const onlyVisible = await exportPresentationToPptx([slide({ title: 'Sichtbar' })], 'T', null);
    // Hidden slide contributes no slideN.xml, so the two decks are byte-comparable in size.
    expect(Math.abs(withHidden.length - onlyVisible.length)).toBeLessThan(400);
  });
});

describe('layout fidelity against the deck CSS', () => {
  it('splits two columns on paragraph boundaries, never inside one', async () => {
    // emitLine pushes one run per SPAN, not per paragraph. Slicing that flat
    // list by index cut a bullet in half. Three runs across two bullets
    // (`a` | `Wichtig` + ` und dringend`) put the old midpoint INSIDE the
    // second bullet: "Wichtig" stayed in column 1, " und dringend" was orphaned
    // at the top of column 2.
    const buf = await exportPresentationToPptx(
      [slide({ layout: 'split', title: 'Zwei Spalten', body: '- a\n- **Wichtig** und dringend' })],
      'Deck',
      '#316049'
    );
    const columns = textBodies(slideXml(buf)).filter((b) => bodyText(b).includes('Wichtig'));
    expect(columns).toHaveLength(1);
    expect(bodyText(columns[0])).toContain('Wichtig und dringend');
  });

  it('never numbers a split slide — split has no variant rules on screen', async () => {
    const buf = await exportPresentationToPptx(
      [slide({ layout: 'split', title: 'Zwei Spalten', body: '- a\n- b', variant: 2 })],
      'Deck',
      '#316049'
    );
    expect(slideXml(buf)).not.toContain('<a:buAutoNum');
  });

  it('keeps content variant 2 numbered', async () => {
    // The guard above must be scoped to `split`, not disable numbering wholesale.
    const buf = await exportPresentationToPptx(
      [slide({ layout: 'content', title: 'Schritte', body: '- a\n- b', variant: 2 })],
      'Deck',
      '#316049'
    );
    expect(slideXml(buf)).toContain('<a:buAutoNum');
  });

  it('does not auto-shrink code slides — the screen excludes them too', async () => {
    const buf = await exportPresentationToPptx(
      [slide({ layout: 'code', title: 'Beispiel', body: 'const x = 1;', codeLanguage: 'ts' })],
      'Deck',
      '#316049'
    );
    expect(slideXml(buf)).not.toContain('<a:normAutofit');
  });

  it('sets AT quotes in Vollkorn and bold, DE quotes in the body face', async () => {
    // The app ships Vollkorn only as Bold/BlackItalic, so a non-bold run would
    // be a synthesized fake. Runs carry the face, so a box-level fontFace never
    // wins — this pins that the override reaches emitLine.
    const at = await exportPresentationToPptx(
      [slide({ layout: 'quote', body: 'Ein Zitat', variant: 0 })],
      'Deck',
      '#257639',
      { brand: 'de-AT' }
    );
    const atQuote = textBodies(slideXml(at)).find((b) => bodyText(b).includes('Ein Zitat')) ?? '';
    expect(atQuote).toContain('typeface="Vollkorn"');
    expect(atQuote).toContain('b="1"');

    const de = await exportPresentationToPptx(
      [slide({ layout: 'quote', body: 'Ein Zitat', variant: 0 })],
      'Deck',
      '#316049',
      { brand: 'de-DE' }
    );
    const deQuote = textBodies(slideXml(de)).find((b) => bodyText(b).includes('Ein Zitat')) ?? '';
    expect(deQuote).toContain('typeface="PT Sans"');
    expect(deQuote).not.toContain('typeface="Vollkorn"');
  });

  it('fits images to their own aspect ratio instead of stretching them', async () => {
    // pptxgenjs never decodes images in Node, so its own `sizing.contain` fits
    // against the declared w/h and cannot correct a ratio — we compute the
    // contain box ourselves.
    const png = await sharp({
      create: { width: 100, height: 400, channels: 3, background: '#005538' },
    })
      .png()
      .toBuffer();
    const buf = await exportPresentationToPptx(
      [
        slide({
          layout: 'image',
          title: 'Bild',
          body: `![](data:image/png;base64,${png.toString('base64')})`,
        }),
      ],
      'Deck',
      '#316049'
    );
    const xml = slideXml(buf);
    const pic = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0] ?? '';
    const ext = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    expect(ext).not.toBeNull();
    const cx = Number(ext?.[1]);
    const cy = Number(ext?.[2]);
    expect(cx / cy).toBeCloseTo(100 / 400, 2);
    // A negative srcRect letterbox is what `sizing` would have emitted; it
    // renders inconsistently in LibreOffice and Keynote.
    expect(pic).not.toMatch(/<a:srcRect[^>]*="-/);
  });
});

describe('sanitizeFilename', () => {
  it('strips unsafe characters and keeps letters/numbers', () => {
    expect(sanitizeFilename('Klima: 2035 / Plan"')).toBe('Klima 2035  Plan');
  });
  it('falls back when empty', () => {
    expect(sanitizeFilename('///')).toBe('Praesentation');
  });
});

describe('asciiFilename / contentDispositionAttachment', () => {
  it('transliterates umlauts to ASCII', () => {
    expect(asciiFilename('Präsentation über Radwege')).toBe('Praesentation ueber Radwege');
  });
  it('builds an ASCII filename plus a UTF-8 filename* for umlaut titles', () => {
    const header = contentDispositionAttachment('Präsentation über Radwege');
    expect(header).toContain('filename="Praesentation ueber Radwege.pptx"');
    expect(header).toContain("filename*=UTF-8''");
    // ASCII token must not carry raw non-ASCII bytes.
    // eslint-disable-next-line no-control-regex
    const asciiToken = header.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(/^[\x20-\x7E]*$/.test(asciiToken)).toBe(true);
  });
});
