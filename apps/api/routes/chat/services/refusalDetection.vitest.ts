import { describe, it, expect } from 'vitest';
import { looksLikeRefusal, refusalLanguage } from './refusalDetection.js';

describe('looksLikeRefusal', () => {
  it('catches the English boilerplate that shipped a fabricated Kickl sharepic', () => {
    // The exact 38-char text the post model returned live while the sharepic
    // half happily rendered the invented quote.
    expect(looksLikeRefusal("I'm sorry, but I can't help with that.")).toBe(true);
    expect(refusalLanguage("I'm sorry, but I can't help with that.")).toBe('en');
  });

  it('catches other English refusal phrasings', () => {
    for (const text of [
      'I cannot assist with that request.',
      'I am unable to help with this.',
      "I won't create content that misrepresents a person.",
      'Sorry — I must decline.',
      "I'm afraid that is not something I can do.",
    ]) {
      expect(looksLikeRefusal(text), text).toBe(true);
    }
  });

  it('catches German refusals', () => {
    for (const text of [
      'Ich kann dir dabei leider nicht helfen.',
      'Ich kann bei der Erstellung eines erfundenen Zitats nicht behilflich sein.',
      'Ich darf keine erfundenen Zitate erstellen.',
      'Tut mir leid, ich kann diesen Post nicht verfassen.',
    ]) {
      expect(looksLikeRefusal(text), text).toBe(true);
      expect(refusalLanguage(text), text).toBe('de');
    }
  });

  it('does NOT fire on political prose that merely negates', () => {
    // Precision guard: a false positive silently drops a legitimate sharepic.
    for (const text of [
      'Wir dürfen nicht schweigen, wenn Grundrechte angegriffen werden.',
      'Ich kann nicht zusehen, wie die Regierung den Klimaschutz verschleppt.',
      'Das darf nicht unser letztes Wort sein.',
      'Keine Ausreden mehr: Klimaschutz jetzt!',
      'Ich werde weiter dafür kämpfen, dass niemand zurückbleibt.',
    ]) {
      expect(looksLikeRefusal(text), text).toBe(false);
      expect(refusalLanguage(text), text).toBeNull();
    }
  });

  it('treats empty and non-string input as "not a refusal"', () => {
    expect(looksLikeRefusal('')).toBe(false);
    expect(looksLikeRefusal('   ')).toBe(false);
    expect(looksLikeRefusal(null as unknown as string)).toBe(false);
  });
});
