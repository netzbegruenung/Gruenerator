import { describe, it, expect } from 'vitest';
import {
  isRefusalError,
  looksLikeRefusal,
  refusalLanguage,
  REFUSAL_ERROR_PREFIX,
} from './refusalDetection.js';

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
      // Inverted word order after a leading adverb — the form models reach for
      // most often, and the one the original pattern missed entirely.
      'Dabei kann ich dir leider nicht helfen.',
      'Leider darf ich solche Zitate nicht erstellen.',
    ]) {
      expect(looksLikeRefusal(text), text).toBe(true);
      expect(refusalLanguage(text), text).toBe('de');
    }
  });

  /**
   * The live safety run (safety-adversarial lane) surfaced that the detector
   * could not read back the product's OWN decline sentences. The first string
   * below is hard-coded in intentExecutionService and is what the social-post
   * cross-gate shows the user; the others are what the models actually wrote.
   *
   * This is not merely an eval artefact. `looksLikeRefusal` gates the
   * social-post halves, the post editor and the loop's synth — a model
   * declining in these words went undetected, and the sharepic half shipped.
   */
  it('catches the decline phrasings the product itself emits', () => {
    for (const text of [
      'Diese Anfrage kann ich nicht umsetzen — dabei entstünde ein erfundenes Zitat oder eine irreführende Aussage im Namen der Partei.',
      'Diese Anfrage setze ich nicht um — sie widerspricht den inhaltlichen Regeln des Grünerators.',
      'Daraus konnte ich keinen Post erzeugen.',
      'Leider konnte ich dabei nicht helfen.',
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
      // The modal must sit next to `ich`. These are the sentences the widened
      // pattern must keep out — ordinary political copy about failure to act.
      'Die Regierung konnte das Klimageld nicht umsetzen.',
      'Der Bund setzt den Beschluss nicht um — wir fordern Tempo.',
      'Wir konnten keine Mehrheit für den Antrag erzeugen.',
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

/**
 * A policy decline is the system working. Logged as ERROR with a stack trace it
 * was indistinguishable from an outage in monitoring — and the stack pointed at
 * the generator, never at anything actionable.
 */
describe('isRefusalError', () => {
  it('recognises the error the sharepic handler throws on a decline', () => {
    const err = new Error(`${REFUSAL_ERROR_PREFIX}Erfundenes Zitat verstößt gegen die Regeln.`);
    expect(isRefusalError(err)).toBe(true);
  });

  it('accepts the bare string form too (Promise.allSettled reasons)', () => {
    expect(isRefusalError(`${REFUSAL_ERROR_PREFIX}Anfrage widerspricht den Werten.`)).toBe(true);
  });

  it('leaves a real failure classified as a failure', () => {
    expect(isRefusalError(new Error('ECONNREFUSED 127.0.0.1:6333'))).toBe(false);
    expect(isRefusalError(new Error('Missing required fields: zitat'))).toBe(false);
  });

  it('tolerates non-error values', () => {
    expect(isRefusalError(null)).toBe(false);
    expect(isRefusalError(undefined)).toBe(false);
    expect(isRefusalError({ message: 'Ablehnung: nope' })).toBe(false);
  });
});
