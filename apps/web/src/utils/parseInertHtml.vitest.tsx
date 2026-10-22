import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseDocPreview } from './parseDocPreview';
import { parseInertHtml } from './parseInertHtml';
import { parseSlidesPreview } from './parseSlidesPreview';
import { parseTablePreview } from './parseTablePreview';

const PAYLOAD = '<img src="x" onerror="window.__previewXss = true">';

describe('parseInertHtml', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses into a document without a browsing context', () => {
    const body = parseInertHtml(PAYLOAD);
    expect(body.querySelector('img')).not.toBeNull();
    expect(body.ownerDocument).not.toBe(document);
  });

  // jsdom loads no images, so `onerror` cannot fire here either way. What the
  // test can hold is the mechanism: no preview parser may build its tree from
  // an element of the live document (`createElement` + `innerHTML`).
  it.each([
    ['parseDocPreview', () => parseDocPreview(`<h1>Titel</h1>${PAYLOAD}<p>Text</p>`)],
    ['parseTablePreview', () => parseTablePreview(`<table><tr><td>a</td></tr></table>${PAYLOAD}`)],
    [
      'parseSlidesPreview',
      () =>
        parseSlidesPreview(`<ol data-preview="slides" data-total="1"><li>A</li></ol>${PAYLOAD}`),
    ],
  ])('%s never parses into the live document', (_name, run) => {
    const createElement = vi.spyOn(document, 'createElement');
    run();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('keeps the table and slides previews working', () => {
    expect(parseTablePreview('<table><tr><th>Ort</th><td> Wien </td></tr></table>')).toEqual([
      ['Ort', 'Wien'],
    ]);
    expect(
      parseSlidesPreview('<ol data-preview="slides" data-total="3"><li>Eins</li><li>Zwei</li></ol>')
    ).toEqual({ titles: ['Eins', 'Zwei'], total: 3 });
  });
});
