import { describe, expect, it } from 'vitest';

import { cleanTextForEmbedding, collapseBlankLines, removeMarkdownImages } from './cleaning.js';

/**
 * The OCR letter-spacing join at cleaning.ts (`([a-zäöüß])\s{2,}([a-zäöüß])`
 * -> `$1$2`) used to match ANY run of 2+ whitespace characters, including a
 * paragraph break (`\n\n`) — not just intra-line OCR spacing ("No  vember").
 * A `\n\n` between two lowercase-adjacent words shows up wherever two block
 * elements touch directly (e.g. `<li>wir fordern</li><li>die stadt</li>`,
 * #3573's before+after separator design produces exactly that at the
 * boundary), so the chunk text fed to embeddings re-glued words the
 * extractor had deliberately separated. Restricted to `[^\S\n]{2,}`
 * (intra-line only) so a paragraph break survives while the OCR case (same
 * line, multiple spaces/tabs) still joins.
 */
describe('cleanTextForEmbedding — OCR letter-spacing join stays intra-line (#3573 fix round 2)', () => {
  it('keeps two words separated by a paragraph break (\\n\\n) as two words', () => {
    expect(cleanTextForEmbedding('fordern\n\ndie', true)).toBe('fordern\n\ndie');
  });

  it('keeps two words separated by a paragraph break as two words with preserveStructure=false too', () => {
    // preserveStructure=false still hits the join regex before the later
    // "collapse all whitespace to one space" step — a caller of the
    // non-structured path must not see the words fused either.
    expect(cleanTextForEmbedding('fordern\n\ndie', false)).toBe('fordern die');
  });

  it('still joins OCR letter-spacing within a single line', () => {
    expect(cleanTextForEmbedding('No  vember', true)).toBe('November');
    expect(cleanTextForEmbedding('kö    nnen', true)).toBe('können');
  });

  it('reproduces the block-boundary scenario end to end (li/li/p/p touching, #3573)', () => {
    // Mirrors what ContentExtractor.blockText's before+after separators
    // produce at a touching block boundary: "\n\n" between "fordern" and
    // "die", between "stadt" and "äpfel", and between "äpfel" and "birnen".
    const text = 'wir fordern\n\ndie stadt\n\näpfel\n\nbirnen';
    expect(cleanTextForEmbedding(text, true)).toBe('wir fordern\n\ndie stadt\n\näpfel\n\nbirnen');
  });

  it('a lone single newline between lowercase letters was never affected (only 2+ whitespace chars match)', () => {
    expect(cleanTextForEmbedding('fordern\ndie', true)).toBe('fordern\ndie');
  });
});

describe('cleanTextForEmbedding — justified text-layer lines are not glued (#3570)', () => {
  it('keeps words apart when a line spaces several words widely', () => {
    const line = 'ma-Governance,   denn   Klimaschutz   muss   endlich   eine Querschnittsaufgabe';
    const expected = 'ma-Governance, denn Klimaschutz muss endlich eine Querschnittsaufgabe';
    expect(cleanTextForEmbedding(line, true)).toBe(expected);
    expect(cleanTextForEmbedding(line, false)).toBe(expected);
  });

  it('still joins a single OCR split inside an otherwise single-spaced line', () => {
    expect(cleanTextForEmbedding('am 3. No  vember wählen', true)).toBe('am 3. November wählen');
  });

  it('decides per line', () => {
    const text = 'Auch   die   Bezirke   sollen\nim No  vember';
    expect(cleanTextForEmbedding(text, true)).toBe('Auch die Bezirke sollen\nim November');
  });
});

describe('cleanTextForEmbedding — existing behaviour unchanged', () => {
  it('removes null bytes', () => {
    expect(cleanTextForEmbedding('a\0b')).toBe('ab');
  });

  it('removes leading whitespace after newlines', () => {
    expect(cleanTextForEmbedding('a\n   b', true)).toBe('a\nb');
  });

  it('dehyphenates words split across a line break', () => {
    expect(cleanTextForEmbedding('Klima-\nschutz')).toBe('Klimaschutz');
  });

  it('collapses a run of spaces to one when preserveStructure is false', () => {
    // Uppercase on both sides so the OCR letter-spacing join above (which
    // only matches lowercase German letters) doesn't fire first.
    expect(cleanTextForEmbedding('A   B', false)).toBe('A B');
  });

  it('leaves blank lines untouched when preserveStructure is true (collapseBlankLines only runs otherwise)', () => {
    expect(cleanTextForEmbedding('a\n\n\n\nb', true)).toBe('a\n\n\n\nb');
  });

  it('flattens newlines to spaces when preserveStructure is false', () => {
    expect(cleanTextForEmbedding('a\n\n\n\nb', false)).toBe('a b');
  });

  it('preserves a page marker line exactly when preserveStructure is true', () => {
    expect(cleanTextForEmbedding('## Seite 3\ntext', true)).toBe('## Seite 3\ntext');
  });

  it('removes markdown images', () => {
    expect(cleanTextForEmbedding('a ![alt](x.png) b')).toBe('a  b');
  });
});

describe('collapseBlankLines', () => {
  it('collapses 3+ consecutive newlines to 2', () => {
    expect(collapseBlankLines('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('leaves a single blank line untouched', () => {
    expect(collapseBlankLines('a\n\nb')).toBe('a\n\nb');
  });
});

describe('removeMarkdownImages', () => {
  it('removes an inline markdown image', () => {
    expect(removeMarkdownImages('a ![alt](x.png) b')).toBe('a  b');
  });

  it('removes an HTML img tag', () => {
    expect(removeMarkdownImages('a <img src="x.png"> b')).toBe('a  b');
  });
});
