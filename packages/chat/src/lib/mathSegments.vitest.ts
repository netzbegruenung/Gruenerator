import { describe, expect, it } from 'vitest';

import { splitMathSegments } from './mathSegments';

describe('splitMathSegments', () => {
  it('passes pure prose through as a single markdown segment', () => {
    const text = 'Hallo Welt.\n\nZweiter Absatz mit **fett**.';
    expect(splitMathSegments(text)).toEqual([{ kind: 'markdown', content: text }]);
  });

  it('extracts a display block between prose', () => {
    const text = 'Der Satz des Pythagoras:\n\n$$a^2 + b^2 = c^2$$\n\nFertig.';
    expect(splitMathSegments(text)).toEqual([
      { kind: 'markdown', content: 'Der Satz des Pythagoras:' },
      { kind: 'math-display', content: 'a^2 + b^2 = c^2' },
      { kind: 'markdown', content: 'Fertig.' },
    ]);
  });

  it('extracts multi-line display blocks', () => {
    const text = '$$\n\\frac{a}{b}\n= c\n$$';
    expect(splitMathSegments(text)).toEqual([
      { kind: 'math-display', content: '\\frac{a}{b}\n= c' },
    ]);
  });

  it('classifies a paragraph with closed inline math as math-paragraph', () => {
    const text = 'Es gilt $E = mc^2$ für alle Massen.\n\nOhne Mathe hier.';
    expect(splitMathSegments(text)).toEqual([
      { kind: 'math-paragraph', content: 'Es gilt $E = mc^2$ für alle Massen.' },
      { kind: 'markdown', content: 'Ohne Mathe hier.' },
    ]);
  });

  it('handles mixed display and inline segments in order', () => {
    const text = 'Erst $x+1$ inline.\n\n$$x^2$$\n\nDann Prosa.\n\nNoch mehr Prosa.';
    expect(splitMathSegments(text)).toEqual([
      { kind: 'math-paragraph', content: 'Erst $x+1$ inline.' },
      { kind: 'math-display', content: 'x^2' },
      { kind: 'markdown', content: 'Dann Prosa.\n\nNoch mehr Prosa.' },
    ]);
  });

  it('keeps an unclosed $$ tail as markdown while streaming', () => {
    const text = 'Die Formel lautet:\n\n$$a^2 + b^';
    expect(splitMathSegments(text)).toEqual([
      { kind: 'markdown', content: 'Die Formel lautet:\n\n$$a^2 + b^' },
    ]);
  });

  it('keeps closed segments stable when the stream closes the tail', () => {
    const before = splitMathSegments('$$a+b$$\n\nUnd dann $$c^2');
    const after = splitMathSegments('$$a+b$$\n\nUnd dann $$c^2$$');
    expect(before[0]).toEqual({ kind: 'math-display', content: 'a+b' });
    expect(before[1]).toEqual({ kind: 'markdown', content: 'Und dann $$c^2' });
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual({ kind: 'math-display', content: 'c^2' });
  });

  it('does not treat prices as inline math', () => {
    const text = 'Das kostet 2.340 €, also 5$ und 10$ zusammen, oder US$ 5.';
    expect(splitMathSegments(text)).toEqual([{ kind: 'markdown', content: text }]);
  });

  it('does not treat whitespace-hugging dollar spans as math', () => {
    const text = 'Preis: $ 5 $ ist keine Formel.';
    expect(splitMathSegments(text)).toEqual([{ kind: 'markdown', content: text }]);
  });

  it('preserves citation markers in markdown segments', () => {
    const text = 'Laut Studie [1] gilt:\n\n$$y = mx + b$$\n\nMehr in [2].';
    expect(splitMathSegments(text)).toEqual([
      { kind: 'markdown', content: 'Laut Studie [1] gilt:' },
      { kind: 'math-display', content: 'y = mx + b' },
      { kind: 'markdown', content: 'Mehr in [2].' },
    ]);
  });

  it('drops empty display blocks and re-merges the surrounding prose', () => {
    expect(splitMathSegments('Text $$ $$ mehr Text')).toEqual([
      { kind: 'markdown', content: 'Text \n\n mehr Text' },
    ]);
  });
});
