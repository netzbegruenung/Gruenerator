import { describe, expect, it } from 'vitest';

import { buildReaderDocument, toBlocks } from './documentReader.js';

const text = (seg: { parts: { text: string }[] }) => seg.parts.map((p) => p.text).join('');

describe('toBlocks', () => {
  it('reads Markdown headings, paragraphs, lists and tables', () => {
    const blocks = toBlocks(
      [
        '## Ausgangslage',
        '',
        'Die Sommer werden **heißer**',
        'und länger.',
        '',
        '- erster Punkt',
        '- zweiter [Punkt](https://x.de)',
        '',
        '| Jahr | Tage |',
        '|---|---|',
        '| 2024 | 12 |',
      ].join('\n')
    );
    expect(blocks).toEqual([
      { kind: 'heading', text: 'Ausgangslage' },
      { kind: 'paragraph', text: 'Die Sommer werden heißer und länger.' },
      { kind: 'paragraph', text: '• erster Punkt' },
      { kind: 'paragraph', text: '• zweiter Punkt' },
      { kind: 'paragraph', text: 'Jahr · Tage' },
      { kind: 'paragraph', text: '2024 · 12' },
    ]);
  });

  it('rebuilds paragraphs from a flat line at sentence boundaries', () => {
    const sentence = 'Das ist ein Satz mit ungefähr sechzig Zeichen Länge, z. B. hier. ';
    const blocks = toBlocks(sentence.repeat(20).trim());
    expect(blocks.length).toBeGreaterThan(1);
    for (const b of blocks) {
      expect(b.kind).toBe('paragraph');
      expect(b.text.endsWith('.')).toBe(true);
    }
    expect(blocks.map((b) => b.text).join(' ')).toBe(sentence.repeat(20).trim());
  });

  it('breaks up a page dump that has line breaks but no paragraphs', () => {
    const page = 'Ein Satz über den Wohnungsbau in Berlin und seine Hemmnisse. '.repeat(40).trim();
    const blocks = toBlocks(`${page}\n\n${page}`);
    expect(blocks.length).toBeGreaterThan(4);
    expect(blocks.every((b) => b.text.length <= 700)).toBe(true);
  });

  it('returns nothing for an empty text', () => {
    expect(toBlocks('  ')).toEqual([]);
  });
});

describe('buildReaderDocument', () => {
  const doc = [
    '## Ausgangslage',
    '',
    'Die Sommer werden heißer. Hitzewellen betreffen alle. Besonders Ältere.',
    '',
    '## Forderungen',
    '',
    'Hitzeschutz muss Pflicht werden. Dazu gehört ein Plan. Es braucht Hitzeschutzbündnisse in den Bezirken.',
  ].join('\n');

  it('marks sentences with a term as numbered passages under their heading', () => {
    const { passages, blocks } = buildReaderDocument(doc, 'Hitzeschutz');
    expect(passages.map((p) => [p.index, p.heading, p.text])).toEqual([
      [0, 'Forderungen', 'Hitzeschutz muss Pflicht werden.'],
      [1, 'Forderungen', 'Es braucht Hitzeschutzbündnisse in den Bezirken.'],
    ]);
    const last = blocks[3];
    expect(last.segments.map((s) => s.passage)).toEqual([0, null, 1]);
    // The compound is found and only its term prefix is marked.
    expect(last.segments[2].parts).toEqual([
      { text: 'Es braucht ', term: false },
      { text: 'Hitzeschutz', term: true },
      { text: 'bündnisse in den Bezirken.', term: false },
    ]);
  });

  it('joins consecutive matching sentences into one passage', () => {
    const { passages } = buildReaderDocument('Hitze kommt. Hitze bleibt. Dann Regen.', 'hitze');
    expect(passages).toHaveLength(1);
    expect(passages[0].text).toBe('Hitze kommt. Hitze bleibt.');
  });

  it('ignores stopwords, so a question does not mark every sentence', () => {
    const { passages } = buildReaderDocument(doc, 'was sagen die zu Hitzewellen');
    expect(passages.map((p) => p.text)).toEqual(['Hitzewellen betreffen alle.']);
  });

  it('finds two-letter abbreviations as whole words only', () => {
    const { passages, blocks } = buildReaderDocument(
      'Die EU handelt. Das ist neu und heute. Europa wartet. Wir sind zu spät.',
      'EU zu'
    );
    expect(passages.map((p) => p.text)).toEqual(['Die EU handelt.']);
    expect(blocks[0].segments[0].parts).toEqual([
      { text: 'Die ', term: false },
      { text: 'EU', term: true },
      { text: ' handelt. ', term: false },
    ]);
  });

  it('keeps the whole text when nothing matches', () => {
    const { passages, blocks } = buildReaderDocument(doc, 'Radverkehr');
    expect(passages).toEqual([]);
    expect(blocks.flatMap((b) => b.segments.map(text)).join('')).toContain('Besonders Ältere.');
  });

  it('marks terms in headings without making them passages', () => {
    const { blocks, passages } = buildReaderDocument(
      '## Hitzeschutz jetzt\n\nKein Treffer.',
      'hitzeschutz'
    );
    expect(blocks[0].segments[0].parts[0]).toEqual({ text: 'Hitzeschutz', term: true });
    expect(passages).toEqual([]);
  });
});
