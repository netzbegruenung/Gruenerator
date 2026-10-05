import { describe, expect, it } from 'vitest';

import { joinPages, renumberPageMarkers, splitPages } from './pageText.js';

describe('splitPages / joinPages', () => {
  it('splits on the markers OcrService writes and joins back', () => {
    const text = '## Seite 1\n\nerste\nZeile\n\n## Seite 2\n\nzweite';
    const pages = splitPages(text);
    expect(pages).toEqual([
      { page: 1, text: 'erste\nZeile' },
      { page: 2, text: 'zweite' },
    ]);
    expect(joinPages(pages)).toBe(text);
  });

  it('keeps a heading that only mentions a page inside the text', () => {
    expect(splitPages('## Seite 1\n\nsiehe ## Seite 4 oben')).toEqual([
      { page: 1, text: 'siehe ## Seite 4 oben' },
    ]);
  });
});

describe('renumberPageMarkers', () => {
  it('maps excerpt pages onto the original pages', () => {
    expect(renumberPageMarkers('## Seite 1\n\na\n\n## Seite 3\n\nb', [109, 110, 111])).toBe(
      '## Seite 109\n\na\n\n## Seite 111\n\nb'
    );
  });

  it('leaves the text alone without a mapping or past its end', () => {
    expect(renumberPageMarkers('## Seite 2', null)).toBe('## Seite 2');
    expect(renumberPageMarkers('## Seite 5', [7])).toBe('## Seite 5');
  });
});
