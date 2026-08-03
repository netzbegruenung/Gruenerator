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

/** Shapes (`<p:sp>`) in document order — each carries its own `<a:off>`. */
function shapes(xml: string): string[] {
  return [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map((m) => m[1]);
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

  it('numbers content variant 2 with accent pills, not PowerPoint numbering', async () => {
    // The screen draws a 30px pill (#eaf2ee) with the index in the heading face
    // and the accent colour. PowerPoint's own numbering cannot be styled that
    // way, so the export draws the pills itself — and must then suppress the
    // built-in marker, or every item would carry two.
    const xml = slideXml(
      await exportPresentationToPptx(
        [slide({ layout: 'content', title: 'Schritte', body: '- a\n- b', variant: 2 })],
        'Deck',
        '#316049'
      )
    );
    expect(xml).not.toContain('<a:buAutoNum');
    expect([...xml.matchAll(/prst="ellipse"/g)]).toHaveLength(2);
    expect([...xml.matchAll(/<a:srgbClr val="EAF2EE"\/>/g)]).toHaveLength(2);
    const digits = textBodies(xml).filter((b) => ['1', '2'].includes(bodyText(b)));
    expect(digits).toHaveLength(2);
    // Heading face + accent, exactly like the CSS `::before`.
    expect(digits[0]).toContain('typeface="GrueneType Neue"');
    expect(digits[0]).toContain('<a:srgbClr val="316049"/>');
  });

  it('lays content variant 1 out as a two-column card grid', async () => {
    // `.layout-content.variant-1 ul` is a 2-column grid of #f0f5f2 cards with
    // the bullet suppressed. The export used to ignore the variant entirely and
    // fall back to a single column of plain bullets.
    const xml = slideXml(
      await exportPresentationToPptx(
        [slide({ layout: 'content', title: 'Karten', body: '- a\n- b\n- c', variant: 1 })],
        'Deck',
        '#316049'
      )
    );
    expect(xml).not.toContain('<a:buChar');
    const cards = [...xml.matchAll(/<a:srgbClr val="F0F5F2"\/>/g)];
    expect(cards).toHaveLength(3);

    // Two columns: items 1 and 2 share a row (same y, different x), item 3
    // starts the next row back at the left edge.
    const boxes = shapes(xml)
      .filter((sp) => sp.includes('prst="roundRect"'))
      .map((sp) => {
        const off = sp.match(/<a:off x="(\d+)" y="(\d+)"\/>/);
        return { x: Number(off?.[1]), y: Number(off?.[2]) };
      });
    expect(boxes).toHaveLength(3);
    expect(boxes[1].y).toBe(boxes[0].y);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    expect(boxes[2].x).toBe(boxes[0].x);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  });

  it('places the body under the measured title, not at a fixed offset', async () => {
    // The screen is a flex column: 64px padding, the title at its natural
    // wrapped height, a 20px gap, then the body. The export pinned the body at
    // 160px, which sits 96px too low when a slide has no title at all.
    const EMU_PER_PX = 914400 / 96;
    const topOf = async (title: string): Promise<number> => {
      const xml = slideXml(
        await exportPresentationToPptx(
          [slide({ layout: 'content', title, body: '- a' })],
          'Deck',
          '#316049'
        )
      );
      // The one shape whose text is the bullet — the title box sits above it.
      const body = shapes(xml).find((sp) => bodyText(sp) === 'a') ?? '';
      return Number(body.match(/<a:off x="\d+" y="(\d+)"\/>/)?.[1] ?? -1) / EMU_PER_PX;
    };

    // One-line DE title: 64 padding + 44px × 1.1 leading + 20 gap.
    expect(await topOf('Kurz')).toBeCloseTo(64 + 44 * 1.1 + 20, 1);
    // No title, no gap — the body starts at the padding edge.
    expect(await topOf('')).toBeCloseTo(64, 1);
  });

  it('uses the AT headline leading (0.9) for the body offset, not the DE 1.1', async () => {
    // headingLineHeight is a CI property and the offset is derived from it, so
    // a brand mix-up here shifts every non-title slide in an AT deck.
    const EMU_PER_PX = 914400 / 96;
    const topOf = async (brand: 'de-DE' | 'de-AT'): Promise<number> => {
      const xml = slideXml(
        await exportPresentationToPptx(
          [slide({ layout: 'content', title: 'Kurz', body: '- a' })],
          'Deck',
          '#316049',
          { brand }
        )
      );
      const body = shapes(xml).find((sp) => bodyText(sp) === 'a') ?? '';
      return Number(body.match(/<a:off x="\d+" y="(\d+)"\/>/)?.[1] ?? -1) / EMU_PER_PX;
    };
    expect(await topOf('de-AT')).toBeCloseTo(64 + 44 * 0.9 + 20, 1);
    expect(await topOf('de-AT')).toBeLessThan(await topOf('de-DE'));
  });

  it('never lets a wrapping quote title run into its own body', async () => {
    // The quote body rests at 180px (the block is vertically centred), but the
    // title box grows with the measured text — a long title used to overlap it.
    const EMU_PER_PX = 914400 / 96;
    const xml = slideXml(
      await exportPresentationToPptx(
        [
          slide({
            layout: 'quote',
            variant: 0,
            title:
              'Ein außergewöhnlich langer Zitattitel über Klimagerechtigkeit, Verkehrswende und die Zukunft der Städte',
            body: 'Der eigentliche Zitattext.',
          }),
        ],
        'Deck',
        '#316049'
      )
    );
    const boxOf = (text: string): { y: number; h: number } => {
      const sp = shapes(xml).find((s) => bodyText(s).includes(text)) ?? '';
      const off = sp.match(/<a:off x="\d+" y="(\d+)"\/>/);
      const ext = sp.match(/<a:ext cx="\d+" cy="(\d+)"\/>/);
      return { y: Number(off?.[1]) / EMU_PER_PX, h: Number(ext?.[1]) / EMU_PER_PX };
    };
    const title = boxOf('Klimagerechtigkeit');
    const body = boxOf('eigentliche');
    expect(title.h).toBeGreaterThan(180 - 64); // the title really did wrap
    expect(body.y).toBeGreaterThanOrEqual(title.y + title.h);
    // And it still ends at the padding edge rather than overrunning the slide.
    expect(body.y + body.h).toBeCloseTo(540 - 64, 1);
  });

  it.each([
    ['Karten', 1, 'roundRect'],
    ['Nummeriert', 2, 'ellipse'],
  ] as const)(
    'tints %s markers with transparent white on a dark background',
    async (_name, variant, prst) => {
      // On dark the CSS swaps the solid tint for rgba(255,255,255,.12/.16).
      // pptxgenjs expresses that as a white fill plus a transparency percent —
      // a solid white card would be unreadable under the white body text.
      const xml = slideXml(
        await exportPresentationToPptx(
          [
            slide({
              layout: 'content',
              title: 'Dunkel',
              body: '- a\n- b',
              variant,
              background: '#005538',
            }),
          ],
          'Deck',
          '#316049'
        )
      );
      const marker = shapes(xml).find((sp) => sp.includes(`prst="${prst}"`)) ?? '';
      expect(marker).toContain('<a:srgbClr val="FFFFFF">');
      // OOXML alpha is percent × 1000 and measures OPACITY, so the CSS .12/.16
      // must come out as 12000/16000 — not as the 88/84 transparency we pass in.
      expect(marker).toMatch(/<a:alpha val="(12000|16000)"\/>/);
      // Body text flips to white with the surface.
      const body = shapes(xml).find((sp) => bodyText(sp) === 'a') ?? '';
      expect(body).toContain('<a:srgbClr val="FFFFFF"/>');
    }
  );

  it('shrinks an overflowing auto-size slide instead of leaving it to PowerPoint', async () => {
    // `<a:normAutofit/>` (what `fit: 'shrink'` emits) is applied by PowerPoint
    // only once the box is edited, and is a no-op in LibreOffice, Keynote and
    // Google Slides — so a freshly opened deck overflowed where the web had
    // long since shrunk. The type scale is now computed here.
    const sizeOf = async (body: string): Promise<number> => {
      const xml = slideXml(
        await exportPresentationToPptx(
          [slide({ layout: 'content', title: 'Viel Text', body })],
          'Deck',
          '#316049'
        )
      );
      const run = textBodies(xml).find((b) => bodyText(b).includes('Zeile'));
      return Number(run?.match(/sz="(\d+)"/)?.[1] ?? 0);
    };

    const short = await sizeOf('- Zeile eins');
    // 28px body × 0.75 = 21pt at scale 1.
    expect(short).toBe(2100);

    const long = await sizeOf(
      Array.from({ length: 14 }, (_, i) => `- Zeile ${i} mit reichlich Text`).join('\n')
    );
    expect(long).toBeLessThan(short);
    // The ladder floor is 0.5 — never smaller, never a non-ladder step.
    expect(long).toBeGreaterThanOrEqual(2100 * 0.5);
  });

  it('honours an explicit font size instead of auto-fitting', async () => {
    const xml = slideXml(
      await exportPresentationToPptx(
        [slide({ layout: 'content', title: 'T', body: '- a', fontSize: 'xl' })],
        'Deck',
        '#316049'
      )
    );
    const run = textBodies(xml).find((b) => bodyText(b).includes('a'));
    expect(run).toContain(`sz="${Math.round(28 * 1.35 * 0.75 * 100)}"`);
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

/**
 * Tables reach the export as a real markdown table now, so they have to leave it
 * as a real PowerPoint table. `bodyToBlocks` used to know only list, blockquote,
 * heading, code and paragraph — a `table` token matched nothing and the export
 * silently shipped a slide with a headline and no data.
 */
describe('tables', () => {
  const TABLE = ['| Quelle | Datum |', '| --- | --- |', '| Rat der EU | 05.03.2026 |'].join('\n');

  it('emits a graphicFrame table, not a text box', async () => {
    const buf = await exportPresentationToPptx(
      [slide({ title: 'Quellenmatrix', body: TABLE })],
      'Deck',
      '#316049'
    );
    const xml = slideXml(buf);
    expect(xml).toContain('<a:tbl>');
    expect((xml.match(/<a:tr /g) ?? []).length).toBe(2);
  });

  it('keeps every cell', async () => {
    const buf = await exportPresentationToPptx([slide({ body: TABLE })], 'Deck', '#316049');
    const xml = slideXml(buf);
    for (const cell of ['Quelle', 'Datum', 'Rat der EU', '05.03.2026']) {
      expect(xml).toContain(`<a:t>${cell}</a:t>`);
    }
  });

  it('fills the header row with the deck accent', async () => {
    const buf = await exportPresentationToPptx([slide({ body: TABLE })], 'Deck', '#7D4F9E');
    const firstRow = slideXml(buf).match(/<a:tr [\s\S]*?<\/a:tr>/)?.[0] ?? '';
    expect(firstRow).toContain('7D4F9E');
  });

  it('places a table below the text that precedes it', async () => {
    const buf = await exportPresentationToPptx(
      [slide({ title: 'T', body: `Ein Absatz davor.\n\n${TABLE}` })],
      'Deck',
      '#316049'
    );
    const xml = slideXml(buf);
    const paraY = Number(
      shapes(xml)
        .find((s) => bodyText(s).includes('Ein Absatz davor.'))
        ?.match(/<a:off x="\d+" y="(\d+)"\/>/)?.[1] ?? 0
    );
    const tableY = Number(
      xml.match(/<p:graphicFrame>[\s\S]*?<a:off x="\d+" y="(\d+)"\/>/)?.[1] ?? 0
    );
    expect(paraY).toBeGreaterThan(0);
    expect(tableY).toBeGreaterThan(paraY);
  });

  it('degrades to text on a layout that cannot place a shape', async () => {
    // A quote pours its whole body into one box; losing the table there would be
    // the very failure this export is fixing.
    const buf = await exportPresentationToPptx(
      [slide({ layout: 'quote', body: TABLE })],
      'Deck',
      '#316049'
    );
    expect(slideXml(buf)).toContain('Rat der EU');
  });
});

/**
 * A body image only became reachable when the slide schema learned an image
 * node: before that, seeding threw the URL away and `firstImageUrl` searched a
 * body that could never contain one.
 */
describe('images in the body', () => {
  async function pngBody(): Promise<string> {
    const png = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#005538' },
    })
      .png()
      .toBuffer();
    return `![Ein Diagramm](data:image/png;base64,${png.toString('base64')})`;
  }

  it('embeds an image that sits in a content body', async () => {
    const buf = await exportPresentationToPptx(
      [slide({ title: 'Mit Bild', body: `Davor\n\n${await pngBody()}` })],
      'Deck',
      '#316049'
    );
    const xml = slideXml(buf);
    expect(xml).toContain('<p:pic>');
    expect(xml).toContain('Davor');
  });

  it('keeps the image aspect ratio inside the body box', async () => {
    const buf = await exportPresentationToPptx(
      [slide({ body: await pngBody() })],
      'Deck',
      '#316049'
    );
    const pic = slideXml(buf).match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0] ?? '';
    const ext = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    expect(Number(ext?.[1]) / Number(ext?.[2])).toBeCloseTo(2, 2);
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
