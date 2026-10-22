import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { fragmentToSafeXml } from './fragmentToSafeXml.js';

/** Baut ein `document-store`-Fragment aus Elementen, die schon im Doc hängen. */
function buildFragment(fill: (fragment: Y.XmlFragment) => void): Y.XmlFragment {
  const fragment = new Y.Doc().getXmlFragment('document-store');
  fill(fragment);
  return fragment;
}

function appendBlock(
  fragment: Y.XmlFragment,
  nodeName: string,
  attributes: Record<string, string> = {}
): Y.XmlText {
  const element = new Y.XmlElement(nodeName);
  fragment.push([element]);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  const text = new Y.XmlText();
  element.push([text]);
  return text;
}

describe('fragmentToSafeXml', () => {
  it('matches Y.XmlFragment.toString() for ordinary BlockNote content', () => {
    const fragment = buildFragment((f) => {
      appendBlock(f, 'heading', { level: '1' }).insert(0, 'Titel');
      const text = appendBlock(f, 'paragraph');
      text.insert(0, 'Hallo ');
      text.insert(6, 'Welt', { bold: {}, italic: {} });
    });

    expect(fragmentToSafeXml(fragment)).toBe(fragment.toString());
  });

  it('escapes markup typed as text', () => {
    const fragment = buildFragment((f) => {
      appendBlock(f, 'paragraph').insert(0, '<img src=x onerror="alert(1)">');
    });

    const xml = fragmentToSafeXml(fragment);
    expect(xml).not.toContain('<img');
    expect(xml).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('unwraps elements BlockNote does not produce and keeps their text', () => {
    const fragment = buildFragment((f) => {
      appendBlock(f, 'img', { src: 'x', onerror: 'alert(1)' }).insert(0, 'bleibt');
      appendBlock(f, 'iframe', { srcdoc: '<script>alert(1)</script>' });
    });

    const xml = fragmentToSafeXml(fragment);
    expect(xml).toBe('bleibt');
  });

  it('unwraps unknown marks and drops their attributes', () => {
    const fragment = buildFragment((f) => {
      appendBlock(f, 'paragraph').insert(0, 'Text', {
        iframe: { srcdoc: '<script>alert(1)</script>' },
        bold: { onclick: 'alert(1)' },
      });
    });

    expect(fragmentToSafeXml(fragment)).toBe('<paragraph><bold>Text</bold></paragraph>');
  });

  it('keeps only `level` on known elements and escapes its value', () => {
    const fragment = buildFragment((f) => {
      appendBlock(f, 'heading', { level: '1" onmouseover="alert(1)', onclick: 'alert(1)' }).insert(
        0,
        'x'
      );
    });

    const xml = fragmentToSafeXml(fragment);
    expect(xml).not.toContain('onclick');
    expect(xml).not.toMatch(/ onmouseover="/);
    expect(xml).toBe('<heading level="1&quot; onmouseover=&quot;alert(1)">x</heading>');
  });
});
