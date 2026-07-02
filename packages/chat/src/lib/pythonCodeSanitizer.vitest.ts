import { describe, expect, it } from 'vitest';

import { sanitizePythonCode } from './pythonCodeSanitizer';

// Test inputs are BUILT FROM CODE POINTS (pure ASCII source) on purpose —
// literal typographic characters in test source can be silently
// editor-normalized to ASCII, making the test vacuously green (which happened
// to the first NBSP test).

const c = (codePoint: number) => String.fromCharCode(codePoint);
const LDQ = c(0x201c); // left double quote
const RDQ = c(0x201d); // right double quote
const LOW_DQ = c(0x201e); // German low double quote
const LSQ = c(0x2018);
const RSQ = c(0x2019);
const LOW_SQ = c(0x201a);
const NBSP = c(0x00a0);
const NNBSP = c(0x202f);
const ZWSP = c(0x200b);
const ZWJ = c(0x200d);
const BOM = c(0xfeff);

describe('sanitizePythonCode', () => {
  it('normalizes German/typographic double quotes to ASCII', () => {
    // Real-world beta failure: GPT-OSS emitted German low/high quotes and
    // Python raised "SyntaxError: unterminated string literal".
    expect(
      sanitizePythonCode(`print(${LOW_DQ}Gesamtgewinn:${LDQ}, df[${LOW_DQ}Gewinn${LDQ}].sum())`)
    ).toBe('print("Gesamtgewinn:", df["Gewinn"].sum())');
    expect(sanitizePythonCode(`print(${LDQ}hi${RDQ})`)).toBe('print("hi")');
  });

  it('normalizes typographic single quotes', () => {
    expect(sanitizePythonCode(`df[${LOW_SQ}Umsatz${LSQ}].mean()`)).toBe("df['Umsatz'].mean()");
    expect(sanitizePythonCode(`x = ${RSQ}a${RSQ}`)).toBe("x = 'a'");
  });

  it('replaces NBSP and narrow NBSP with plain spaces', () => {
    expect(sanitizePythonCode(`print(${NBSP}1 + 2)`)).toBe('print( 1 + 2)');
    // U+202F narrow NBSP — Mistral models like to emit it around numbers.
    expect(sanitizePythonCode(`print("x:",${NNBSP}df.sum())`)).toBe('print("x:", df.sum())');
  });

  it('strips zero-width characters and BOM', () => {
    expect(sanitizePythonCode(`pri${ZWSP}nt(1)${BOM}`)).toBe('print(1)');
    expect(sanitizePythonCode(`a${ZWJ}=1`)).toBe('a=1');
  });

  it('leaves already-clean code untouched', () => {
    const code = 'print("Gesamtgewinn:", df["Gewinn"].sum())';
    expect(sanitizePythonCode(code)).toBe(code);
  });
});
