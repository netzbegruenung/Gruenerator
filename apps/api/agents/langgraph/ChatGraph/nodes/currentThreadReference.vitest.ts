/**
 * Distinguishing "what did we say in THIS chat" from "find our earlier chat".
 *
 * The live failure: "Du hast meine Frage nach dem Bundeskanzler vorhin nicht
 * beantwortet … was war meine allererste Frage in diesem Chat?" was routed to
 * `chat_history`, which searched Qdrant over PAST threads, found 0 hits and
 * answered that no sources were available — while the answer stood a few
 * messages above, already in context.
 */
import { describe, it, expect } from 'vitest';

import { CHAT_HISTORY_KEYWORDS, CURRENT_THREAD_REFERENCE } from './classifierParsing.js';

describe('CURRENT_THREAD_REFERENCE', () => {
  it('matches references to the running conversation', () => {
    for (const text of [
      'Du hast meine Frage vorhin nicht beantwortet.',
      'Was war meine allererste Frage in diesem Chat?',
      'Schau nochmal weiter oben.',
      'Deine letzte Antwort war unvollständig.',
      'Fass zusammen, worum es in diesem Gespräch ging.',
    ]) {
      expect(CURRENT_THREAD_REFERENCE.test(text), text).toBe(true);
    }
  });

  it('does not match references to EARLIER, separate conversations', () => {
    // These must keep reaching chat_history — that is what the recall is for.
    for (const text of [
      'Was haben wir letztes Mal besprochen?',
      'Finde unseren Chat über den Newsletter.',
      'Mach da weiter, wo wir aufgehört haben.',
      'Zeig mir meine Präsentation zur Klimapolitik.',
    ]) {
      expect(CURRENT_THREAD_REFERENCE.test(text), text).toBe(false);
    }
  });

  it('leaves the past-conversation keywords the deciding signal when both appear', () => {
    // "vorhin" plus an explicit past-thread reference must stay chat_history —
    // the veto in classifierNode only fires when NO past reference is present.
    const mixed = 'Wir hatten das letztes Mal besprochen, du hast es vorhin nochmal erwähnt.';
    expect(CURRENT_THREAD_REFERENCE.test(mixed)).toBe(true);
    expect(CHAT_HISTORY_KEYWORDS.test(mixed)).toBe(true);
  });
});
