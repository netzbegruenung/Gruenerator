import { describe, expect, it } from 'vitest';

import { remarkCitationMarkers, splitCitationText } from './remarkCitationMarkers';

// Hand-built mdast, no unified: the plugin is a pure tree walk and these pin
// its semantics, which mirror the string rewriter it replaced.
const text = (value: string) => ({ type: 'text', value });
const cite = (n: string) => ({
  type: 'citation',
  data: { hName: 'citation', hProperties: { n } },
});
const paragraph = (...children: unknown[]) => ({ type: 'paragraph', children });
const root = (...children: unknown[]) => ({ type: 'root', children });

const run = (tree: { type: string }) => {
  remarkCitationMarkers()(tree);
  return tree;
};

describe('splitCitationText', () => {
  it('splits a single marker into text, badge, text', () => {
    expect(splitCitationText('Laut Bericht [1] steigt der Anteil.')).toEqual([
      text('Laut Bericht '),
      cite('1'),
      text(' steigt der Anteil.'),
    ]);
  });

  it('expands a grouped marker to one badge per id', () => {
    expect(splitCitationText('Beide Quellen [1, 2] belegen das.')).toEqual([
      text('Beide Quellen '),
      cite('1'),
      cite('2'),
      text(' belegen das.'),
    ]);
  });

  it('drops out-of-range ids from a partly out-of-range group', () => {
    expect(splitCitationText('Siehe [2, 1234].')).toEqual([text('Siehe '), cite('2'), text('.')]);
  });

  it('leaves a fully out-of-range group as literal text', () => {
    expect(splitCitationText('Siehe [1234].')).toBeNull();
    expect(splitCitationText('Siehe [1000, 5000].')).toBeNull();
  });

  it('leaves non-numeric brackets untouched', () => {
    expect(splitCitationText('ein [Link](https://x.test)')).toBeNull();
    expect(splitCitationText('Siehe [Anhang] und [a, b].')).toBeNull();
  });

  it('handles several markers in one text node', () => {
    expect(splitCitationText('[1] und [2] und [3]')).toEqual([
      cite('1'),
      text(' und '),
      cite('2'),
      text(' und '),
      cite('3'),
    ]);
  });

  it('leaves a half-streamed marker literal until it closes', () => {
    // This is what keeps the reveal prefix-stable: `[1` is plain text.
    expect(splitCitationText('Der Beschluss nennt drei Ziele [1')).toBeNull();
    expect(splitCitationText('Der Beschluss nennt drei Ziele [2, ')).toBeNull();
  });
});

describe('remarkCitationMarkers', () => {
  it('rewrites text nodes in place, in document order', () => {
    const tree = run(root(paragraph(text('Laut Bericht [1] steigt der Anteil [2, 7].'))));
    expect(tree).toEqual(
      root(
        paragraph(
          text('Laut Bericht '),
          cite('1'),
          text(' steigt der Anteil '),
          cite('2'),
          cite('7'),
          text('.')
        )
      )
    );
  });

  it('descends into inline containers such as strong and strikethrough', () => {
    const tree = run(
      root(
        paragraph({ type: 'delete', children: [text('falsch [1]')] }, text(' richtig '), {
          type: 'strong',
          children: [text('[2]')],
        })
      )
    );
    expect(tree).toEqual(
      root(
        paragraph({ type: 'delete', children: [text('falsch '), cite('1')] }, text(' richtig '), {
          type: 'strong',
          children: [cite('2')],
        })
      )
    );
  });

  it('never touches code: inline code and fences are not text nodes', () => {
    const inline = { type: 'inlineCode', value: 'arr[1]' };
    const fence = { type: 'code', lang: 'ts', value: 'const x = arr[1];\nconst y = [2];' };
    const tree = run(root(paragraph(text('Zugriff via '), inline, text(' liefert [2].')), fence));
    expect(tree).toEqual(
      root(paragraph(text('Zugriff via '), inline, text(' liefert '), cite('2'), text('.')), fence)
    );
  });

  it('leaves a tree without markers structurally identical', () => {
    const para = paragraph(text('Kein Marker hier.'));
    const tree = root(para);
    run(tree);
    expect(tree.children[0]).toBe(para);
    expect(para.children[0]).toEqual(text('Kein Marker hier.'));
  });

  it('ignores a tree that is not a parent', () => {
    expect(() => run({ type: 'text' })).not.toThrow();
  });
});
