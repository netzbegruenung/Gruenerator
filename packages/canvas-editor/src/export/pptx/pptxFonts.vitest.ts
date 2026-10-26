import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRAND_WEB_FONT_FACES } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { PPTX_FONT_ALIASES, pptxFont } from './pptxFonts';

describe('pptxFont', () => {
  it('knows every family the canvas registers with @font-face', () => {
    // typography.css declares the open faces; the brand faces are injected at
    // runtime from the contracts registry.
    const css = readFileSync(join(import.meta.dirname, '../../styles/typography.css'), 'utf8');
    const registered = new Set([
      ...[...css.matchAll(/@font-face\s*{[^}]*font-family:\s*'([^']+)'/g)].map((m) => m[1]),
      ...BRAND_WEB_FONT_FACES.map((face) => face.family),
    ]);
    expect([...registered].sort()).toEqual([...PPTX_FONT_ALIASES].sort());
  });

  it('maps web aliases to the family names in the font files', () => {
    expect(pptxFont('GrueneTypeNeue', false, false).fontFace).toBe('GrueneType Neue');
    expect(pptxFont('GrueneType', false, false).fontFace).toBe('GrueneType Black Cond Italic');
    expect(pptxFont('GothamNarrow-Ultra', false, false).fontFace).toBe('Gotham Narrow Ultra');
    expect(pptxFont('GothamNarrow-Book', false, false).fontFace).toBe('Gotham Narrow Book');
    expect(pptxFont('GothamNarrow-Bold', true, false)).toEqual({
      fontFace: 'Gotham Narrow Bold',
      bold: true,
      italic: false,
    });
  });

  it('keeps bold/italic for style-linked families', () => {
    expect(pptxFont('PT Sans', true, true)).toEqual({
      fontFace: 'PT Sans',
      bold: true,
      italic: true,
    });
    expect(pptxFont("'PT Sans', Arial, sans-serif", false, false).fontFace).toBe('PT Sans');
  });

  it('picks the Vollkorn face typography.css assigns', () => {
    expect(pptxFont('Vollkorn', false, true)).toEqual({
      fontFace: 'Vollkorn',
      bold: true,
      italic: true,
    });
    expect(pptxFont('Vollkorn', true, true)).toEqual({
      fontFace: 'Vollkorn Black',
      bold: false,
      italic: true,
    });
  });

  it('passes unknown families through', () => {
    expect(pptxFont('Arial', false, false).fontFace).toBe('Arial');
  });
});
