import { type Slide } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  asciiFilename,
  contentDispositionAttachment,
  exportPresentationToPptx,
  sanitizeFilename,
} from './presentationPptxExport.js';

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
