import { describe, expect, it } from 'vitest';

import { sanitizePythonCode } from './pythonCodeSanitizer';

describe('sanitizePythonCode', () => {
  it('normalizes German/typographic double quotes to ASCII', () => {
    // Real-world beta failure: GPT-OSS emitted „…" quotes → Python raised
    // "SyntaxError: unterminated string literal (detected at line 1)".
    expect(sanitizePythonCode('print(„Gesamtgewinn:", df[„Gewinn"].sum())')).toBe(
      'print("Gesamtgewinn:", df["Gewinn"].sum())'
    );
    expect(sanitizePythonCode('print(“hi”)')).toBe('print("hi")');
  });

  it('normalizes typographic single quotes', () => {
    expect(sanitizePythonCode("df[‚Umsatz'].mean()")).toBe("df['Umsatz'].mean()");
    expect(sanitizePythonCode('x = ’a’')).toBe("x = 'a'");
  });

  it('replaces non-breaking spaces and strips zero-width characters', () => {
    expect(sanitizePythonCode('print( 1 + 2)')).toBe('print( 1 + 2)');
    expect(sanitizePythonCode('pri​nt(1)﻿')).toBe('print(1)');
  });

  it('leaves already-clean code untouched', () => {
    const code = 'print("Gesamtgewinn:", df["Gewinn"].sum())';
    expect(sanitizePythonCode(code)).toBe(code);
  });
});
