import { describe, expect, it } from 'vitest';

import { htmlToExcerpt, parseDocPreview } from './htmlExcerpt';

/**
 * React Native has no DOM, so document HTML is reduced to text with regexes.
 * The entity-decoding order is the subtle part and is asserted explicitly.
 */

describe('htmlToExcerpt', () => {
  it('strips tags and collapses the whitespace they leave behind', () => {
    expect(htmlToExcerpt('<p>Hallo</p><p>Welt</p>')).toBe('Hallo Welt');
  });

  it('decodes the entities the editor actually emits', () => {
    expect(htmlToExcerpt('<p>Anna&nbsp;&amp;&nbsp;Ben</p>')).toBe('Anna & Ben');
    expect(htmlToExcerpt('<p>&lt;tag&gt; &quot;zitat&quot; &#39;x&#39; &apos;y&apos;</p>')).toBe(
      "<tag> \"zitat\" 'x' 'y'"
    );
  });

  it('decodes &amp; last so an escaped entity stays literal', () => {
    // "&amp;lt;" must render as the text "&lt;", not as "<". Decoding &amp;
    // first would double-unescape it.
    expect(htmlToExcerpt('<p>&amp;lt;</p>')).toBe('&lt;');
  });

  it('trims and collapses runs of whitespace and newlines', () => {
    expect(htmlToExcerpt('<p>  viel\n\n   Luft  </p>')).toBe('viel Luft');
  });

  it('truncates with an ellipsis beyond the limit', () => {
    const excerpt = htmlToExcerpt(`<p>${'a'.repeat(200)}</p>`, 10);
    expect(excerpt).toBe(`${'a'.repeat(10)}…`);
  });

  it('leaves text at exactly the limit untouched', () => {
    expect(htmlToExcerpt(`<p>${'a'.repeat(10)}</p>`, 10)).toBe('a'.repeat(10));
  });

  it('returns an empty string for empty or tag-only input', () => {
    expect(htmlToExcerpt('')).toBe('');
    expect(htmlToExcerpt('<p></p><br/>')).toBe('');
  });
});

describe('parseDocPreview', () => {
  it('splits the first heading off the body', () => {
    expect(parseDocPreview('<h1>Kampagnenplan</h1><p>Erster Absatz</p>')).toEqual({
      heading: 'Kampagnenplan',
      body: 'Erster Absatz',
    });
  });

  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])('recognises <%s> as the heading', (tag) => {
    expect(parseDocPreview(`<${tag}>Titel</${tag}><p>Text</p>`).heading).toBe('Titel');
  });

  it('takes only the first heading and leaves later ones in the body', () => {
    const { heading, body } = parseDocPreview('<h1>Erst</h1><p>A</p><h2>Zweit</h2><p>B</p>');
    expect(heading).toBe('Erst');
    expect(body).toBe('A Zweit B');
  });

  it('reports a null heading when the document has none', () => {
    expect(parseDocPreview('<p>Nur Text</p>')).toEqual({ heading: null, body: 'Nur Text' });
  });

  it('reports a null heading when the heading is empty', () => {
    expect(parseDocPreview('<h1></h1><p>Text</p>')).toEqual({ heading: null, body: 'Text' });
  });

  it('does not strip a body that merely happens to repeat the heading text later', () => {
    const { body } = parseDocPreview('<h1>Titel</h1><p>Absatz über Titel</p>');
    expect(body).toBe('Absatz über Titel');
  });

  it('handles a heading with attributes and nested markup', () => {
    expect(parseDocPreview('<h2 class="x"><strong>Fett</strong> Titel</h2><p>Text</p>')).toEqual({
      heading: 'Fett Titel',
      body: 'Text',
    });
  });
});
