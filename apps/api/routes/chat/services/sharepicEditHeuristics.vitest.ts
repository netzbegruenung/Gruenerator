import { describe, it, expect } from 'vitest';

import { isSharepicEditInstruction, hasSharepicEditVerb } from './sharepicEditHeuristics.js';

describe('isSharepicEditInstruction', () => {
  it('matches umlaut-initial verbs (the \\b bug: "ändere"/"änderungen" never matched)', () => {
    expect(isSharepicEditInstruction('ändere die farbe')).toBe(true);
    expect(isSharepicEditInstruction('der text ergibt keinen sinn, schlage änderungen vor')).toBe(
      true
    );
  });

  it('matches umlaut-initial nouns ("überschrift")', () => {
    expect(isSharepicEditInstruction('die überschrift anpassen')).toBe(true);
  });

  it('treats "sharepic" itself as an editable noun', () => {
    expect(isSharepicEditInstruction('setze ein in das sharepic')).toBe(true);
    expect(isSharepicEditInstruction('mach das in die variante rein')).toBe(true);
  });

  it('still matches the ASCII cases', () => {
    expect(isSharepicEditInstruction('mach zeile 2 kürzer')).toBe(true);
    expect(isSharepicEditInstruction('balken nach oben verschieben')).toBe(true);
  });

  it('never fires on fresh-variant requests', () => {
    expect(isSharepicEditInstruction('mach mir ein neues sharepic')).toBe(false);
    expect(isSharepicEditInstruction('zeig mir alle varianten')).toBe(false);
  });

  it('requires an edit verb', () => {
    expect(isSharepicEditInstruction('was steht im wahlprogramm zum klimaschutz?')).toBe(false);
  });
});

describe('hasSharepicEditVerb (relaxed Sharepic-Modus check)', () => {
  it('fires on verb-only instructions that lack a noun', () => {
    expect(hasSharepicEditVerb('setz das bitte um')).toBe(true);
    expect(hasSharepicEditVerb('ändere das entsprechend')).toBe(true);
  });

  it('stays quiet on plain questions and fresh-variant requests', () => {
    expect(hasSharepicEditVerb('was bedeutet das?')).toBe(false);
    expect(hasSharepicEditVerb('drei varianten bitte')).toBe(false);
  });
});
