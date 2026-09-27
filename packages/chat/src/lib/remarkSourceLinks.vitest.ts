import { describe, expect, it } from 'vitest';

import { remarkSourceLinks } from './remarkSourceLinks';

// Hand-built mdast, no unified: the plugin is a pure tree walk.
const text = (value: string) => ({ type: 'text', value });
const link = (url: string, ...children: unknown[]) => ({ type: 'link', url, children });
const sourceLink = (n: string, ...children: unknown[]) => ({
  type: 'sourceLink',
  children,
  data: { hName: 'sourcelink', hProperties: { n } },
});
const node = (type: string, ...children: unknown[]) => ({ type, children });

const run = (tree: { type: string }) => {
  remarkSourceLinks()(tree);
  return tree;
};

describe('remarkSourceLinks', () => {
  it('turns a quelle: link into a sourcelink element and keeps its label', () => {
    const tree = node('root', node('listItem', node('paragraph', link('quelle:3', text('Titel')))));
    expect(run(tree)).toEqual(
      node('root', node('listItem', node('paragraph', sourceLink('3', text('Titel')))))
    );
  });

  it('keeps formatting inside the label', () => {
    const tree = node('paragraph', link('quelle:1', node('strong', text('Wahlprogramm'))));
    expect(run(tree)).toEqual(
      node('paragraph', sourceLink('1', node('strong', text('Wahlprogramm'))))
    );
  });

  it('leaves ordinary links and malformed targets alone', () => {
    const tree = node(
      'paragraph',
      link('https://gruene.de', text('gruene.de')),
      link('quelle:abc', text('kaputt'))
    );
    const before = structuredClone(tree);
    expect(run(tree)).toEqual(before);
  });
});
