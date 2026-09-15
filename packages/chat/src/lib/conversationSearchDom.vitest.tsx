import { describe, expect, it } from 'vitest';

import { collectHits, collectSpans, findMatches, rangeForMatch } from './conversationSearch';

/**
 * jsdom reports 0x0 for every getBoundingClientRect, which is exactly the value
 * `collectHits` treats as "not painted" — hence the injected `rectOf`. Without
 * that seam these tests could only ever assert an empty result.
 */
const rectOf = () => ({ top: 10, width: 40, height: 16 }) as DOMRect;

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.replaceChildren(host);
  return host;
}

describe('collectSpans', () => {
  it('joins across inline elements so markdown emphasis does not split a word', () => {
    const root = mount('<p>Klima<strong>politik</strong> heute</p>');

    const { text, spans } = collectSpans(root);

    expect(text).toContain('Klimapolitik');
    const match = findMatches(text, 'klimapolitik')[0];
    expect(match).toBeDefined();
    const range = rangeForMatch(spans, match!);
    // The range has to span BOTH text nodes, or the highlight covers half a word.
    expect(range?.startContainer).not.toBe(range?.endContainer);
    expect(range?.toString()).toBe('Klimapolitik');
  });

  it('separates block boundaries so adjacent paragraphs do not fuse', () => {
    const root = mount('<p>Ende</p><p>Anfang</p>');

    const { text } = collectSpans(root);

    expect(findMatches(text, 'endeanfang')).toEqual([]);
    expect(findMatches(text, 'anfang')).toHaveLength(1);
  });

  it('skips screen-reader-only and aria-hidden subtrees', () => {
    const root = mount(
      '<p>sichtbar</p><span class="sr-only">windkraft</span><span aria-hidden="true">windkraft</span>'
    );

    const { text } = collectSpans(root);

    expect(findMatches(text, 'windkraft')).toEqual([]);
    expect(findMatches(text, 'sichtbar')).toHaveLength(1);
  });
});

describe('collectHits', () => {
  it('returns hits in document order across messages, tagged with their message', () => {
    const viewport = mount(
      '<div data-message-id="m1"><p>Windkraft eins</p></div>' +
        '<div data-message-id="m2"><p>Windkraft zwei</p></div>'
    );

    const hits = collectHits(viewport, 'windkraft', { rectOf });

    expect(hits.map((h) => h.messageId)).toEqual(['m1', 'm2']);
    expect(hits.map((h) => h.id)).toEqual(['m1#0', 'm2#0']);
  });

  it('numbers repeated hits inside one message', () => {
    const viewport = mount('<div data-message-id="m1"><p>Wind und Wind</p></div>');

    expect(collectHits(viewport, 'wind', { rectOf }).map((h) => h.id)).toEqual(['m1#0', 'm1#1']);
  });

  it('carries the surrounding text for the preview line', () => {
    const viewport = mount('<div data-message-id="m1"><p>mehr Windkraft im Landkreis</p></div>');

    const hit = collectHits(viewport, 'windkraft', { rectOf })[0];

    expect(hit?.match).toBe('Windkraft');
    expect(hit?.before).toContain('mehr');
    expect(hit?.after).toContain('Landkreis');
  });

  it('drops hits the browser does not paint', () => {
    const viewport = mount('<div data-message-id="m1"><p>Windkraft</p></div>');

    const hits = collectHits(viewport, 'windkraft', {
      rectOf: () => ({ top: 0, width: 0, height: 0 }) as DOMRect,
    });

    expect(hits).toEqual([]);
  });

  it('finds nothing outside a message root', () => {
    const viewport = mount('<p>Windkraft im Composer</p>');

    expect(collectHits(viewport, 'windkraft', { rectOf })).toEqual([]);
  });
});
