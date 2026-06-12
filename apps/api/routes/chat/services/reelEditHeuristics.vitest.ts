import { describe, it, expect } from 'vitest';

import { isReelEditInstruction, hasReelEditVerb, hasStrongReelNoun } from './reelEditHeuristics.js';

describe('isReelEditInstruction', () => {
  it('matches umlaut-initial verbs (\\b fails on "ändere")', () => {
    expect(isReelEditInstruction('ändere die untertitel')).toBe(true);
    expect(isReelEditInstruction('die Untertitel kürzen bitte')).toBe(true);
  });

  it('matches the primary phrasings', () => {
    expect(isReelEditInstruction('Untertitel meines Reels anpassen')).toBe(true);
    expect(isReelEditInstruction('Korrigiere die Tippfehler in den Untertiteln')).toBe(true);
    expect(isReelEditInstruction('formuliere segment 3 um')).toBe(true);
    expect(isReelEditInstruction('mach die captions kürzer')).toBe(true);
  });

  it('requires both an edit verb and a reel noun', () => {
    expect(isReelEditInstruction('untertitel')).toBe(false);
    expect(isReelEditInstruction('mach das kürzer')).toBe(false);
    expect(isReelEditInstruction('was ist ein reel?')).toBe(false);
  });

  it('never treats "create a new reel/video" as an edit', () => {
    expect(isReelEditInstruction('erstelle ein neues Reel')).toBe(false);
    expect(isReelEditInstruction('mach ein neues video')).toBe(false);
  });

  it('does not fire on sharepic phrasings', () => {
    expect(isReelEditInstruction('mach zeile 2 kürzer')).toBe(false);
    expect(isReelEditInstruction('anderes hintergrundbild für das sharepic')).toBe(false);
  });
});

describe('hasStrongReelNoun', () => {
  it('distinguishes reel-only nouns from generic ones', () => {
    expect(hasStrongReelNoun('untertitel anpassen')).toBe(true);
    expect(hasStrongReelNoun('mein reel bearbeiten')).toBe(true);
    expect(hasStrongReelNoun('segment 2 kürzen')).toBe(false);
    expect(hasStrongReelNoun('den video text ändern')).toBe(false);
  });
});

describe('hasReelEditVerb', () => {
  it('matches a lone edit verb (active Reel-Modus follow-ups)', () => {
    expect(hasReelEditVerb('mach das kürzer')).toBe(true);
    expect(hasReelEditVerb('korrigier das bitte')).toBe(true);
  });

  it('still rejects new-reel requests', () => {
    expect(hasReelEditVerb('erstelle ein neues reel')).toBe(false);
  });

  it('rejects plain questions', () => {
    expect(hasReelEditVerb('wie ist das wetter heute?')).toBe(false);
  });
});
