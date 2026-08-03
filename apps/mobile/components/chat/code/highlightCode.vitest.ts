import { describe, expect, it } from 'vitest';

import { highlightCode, normalizeLanguage, type CodeToken } from './highlightCode';

/** The tokens of one kind, in order — what a test usually wants to assert. */
function of(tokens: CodeToken[], kind: CodeToken['kind']): string[] {
  return tokens.filter((t) => t.kind === kind).map((t) => t.text);
}

describe('normalizeLanguage', () => {
  it('folds aliases onto one family', () => {
    expect(normalizeLanguage('tsx')).toBe('js');
    expect(normalizeLanguage('TypeScript')).toBe('js');
    expect(normalizeLanguage('py')).toBe('python');
    expect(normalizeLanguage('zsh')).toBe('shell');
  });

  it('ignores anything after the language, as fences carry metadata', () => {
    expect(normalizeLanguage('python title="beispiel.py"')).toBe('python');
  });

  it('falls back to plain for an unknown or missing language', () => {
    expect(normalizeLanguage('brainfuck')).toBe('plain');
    expect(normalizeLanguage('')).toBe('plain');
    expect(normalizeLanguage(null)).toBe('plain');
  });
});

describe('highlightCode', () => {
  // The one property that must never break: a highlighter that drops a
  // character shows the user code that differs from what the model wrote.
  it('reproduces the source exactly', () => {
    const samples = [
      'const x = "a\\"b"; // rest',
      'def f(n):\n    return n * 2  # verdoppeln',
      '{"a": [1, 2.5, true], "b": null}',
      'SELECT * FROM t -- alles\nWHERE id = 3;',
      'echo "hi" # kommentar',
      '',
      'ohne alles',
    ];

    for (const sample of samples) {
      expect(
        highlightCode(sample, 'js')
          .map((t) => t.text)
          .join('')
      ).toBe(sample);
      expect(
        highlightCode(sample, 'python')
          .map((t) => t.text)
          .join('')
      ).toBe(sample);
    }
  });

  it('marks keywords, strings, numbers and comments', () => {
    const tokens = highlightCode('const n = 42; // zählt', 'js');

    expect(of(tokens, 'keyword')).toEqual(['const']);
    expect(of(tokens, 'number')).toEqual(['42']);
    expect(of(tokens, 'comment')).toEqual(['// zählt']);
  });

  it('does not treat an identifier that starts with a keyword as one', () => {
    expect(of(highlightCode('constant = 1', 'js'), 'keyword')).toEqual([]);
  });

  it('keeps a keyword inside a string out of the keyword set', () => {
    const tokens = highlightCode('x = "return me"', 'js');

    expect(of(tokens, 'keyword')).toEqual([]);
    expect(of(tokens, 'string')).toEqual(['"return me"']);
  });

  it('handles an escaped quote inside a string', () => {
    expect(of(highlightCode('a = "sag \\"hallo\\" bitte"', 'js'), 'string')).toEqual([
      '"sag \\"hallo\\" bitte"',
    ]);
  });

  // Fences arrive character by character while streaming, so a half-written
  // string is the normal case, not an edge case.
  it('closes an unterminated string at the end of the input', () => {
    const tokens = highlightCode('name = "noch nicht ferti', 'python');

    expect(of(tokens, 'string')).toEqual(['"noch nicht ferti']);
  });

  it('uses the comment marker of the language', () => {
    expect(of(highlightCode('# hallo', 'python'), 'comment')).toEqual(['# hallo']);
    expect(of(highlightCode('# hallo', 'js'), 'comment')).toEqual([]);
    expect(of(highlightCode('-- hallo', 'sql'), 'comment')).toEqual(['-- hallo']);
  });

  // `//` inside JSON is data, not a comment — a URL would otherwise grey out
  // the rest of the line.
  it('does not invent comments in JSON', () => {
    const tokens = highlightCode('{"url": "https://gruenerator.eu"}', 'json');

    expect(of(tokens, 'comment')).toEqual([]);
    expect(of(tokens, 'string')).toEqual(['"url"', '"https://gruenerator.eu"']);
  });

  it('marks JSON literals but no general keywords', () => {
    expect(of(highlightCode('{"a": true, "b": null}', 'json'), 'keyword')).toEqual([
      'true',
      'null',
    ]);
  });

  it('reads a block comment in JS, including an unterminated one', () => {
    expect(of(highlightCode('a /* weg */ b', 'js'), 'comment')).toEqual(['/* weg */']);
    expect(of(highlightCode('a /* nie zu', 'js'), 'comment')).toEqual(['/* nie zu']);
  });

  it('does not read a digit inside an identifier as a number', () => {
    expect(of(highlightCode('agent2 = 1', 'python'), 'number')).toEqual(['1']);
  });

  it('leaves an unknown language as plain text in one token', () => {
    const tokens = highlightCode('const x = 1', 'plain');

    expect(of(tokens, 'keyword')).toEqual([]);
    expect(of(tokens, 'number')).toEqual(['1']);
  });

  it('returns nothing for empty input', () => {
    expect(highlightCode('', 'js')).toEqual([]);
  });
});
