import { describe, it, expect } from 'vitest';

import { parseClassifierResponse } from './classifierParsing.js';
import { CLASSIFIER_OFFERED_INTENTS } from './classifierPrompt.js';

/**
 * The classifier has TWO doors. `isOfferedIntent` fixed the primary one: the
 * prompt offered create_sheet / create_presentation / create_recurring_task
 * while the parser's hand-written accept-list did not, so those verdicts were
 * dropped and the turn fell to `direct` (classifierPrompt.ts:33-43).
 *
 * The regex fallback — the path taken when the model's JSON is malformed — was
 * a second hand-written list with exactly the same gap, and it stayed. These
 * tests pin the set, not the wording, so the two doors can no longer disagree.
 */
describe('classifier fallback chain covers every offered intent', () => {
  // Malformed on purpose: no closing brace, so JSON.parse fails and the regex
  // chain is what actually decides. That is the whole point of the path.
  const malformed = (intent: string) => `{"intent": "${intent}", "reasoning": "weil`;

  it.each([...CLASSIFIER_OFFERED_INTENTS])('detects %s in a malformed response', (intent) => {
    expect(parseClassifierResponse(malformed(intent), 'Mach mir was').intent).toBe(intent);
  });

  it('the twelve intents that used to fall through are among them', () => {
    // Named explicitly because this is the shipped-bug list, not a sample.
    for (const intent of [
      'create_sheet',
      'create_presentation',
      'create_recurring_task',
      'abgeordnetenwatch',
      'bundestag',
      'image_edit',
      'compute',
      'artifact',
      'modify_doc',
      'modify_board',
      'chat_history',
      'mcp',
    ]) {
      expect(parseClassifierResponse(malformed(intent), 'Mach mir was').intent).toBe(intent);
    }
  });

  it('still defaults to direct when nothing looks like an intent field', () => {
    expect(parseClassifierResponse('völlig kaputt, kein Feld hier', 'Hallo').intent).toBe('direct');
  });

  it('keeps the editorial priorities that a single regex order cannot express', () => {
    // A malformed response can mention `intent:` more than once; first match
    // wins. sharepic must beat image, social_post must beat examples.
    expect(parseClassifierResponse('{"intent": "image", "intent": "sharepic"', 'x').intent).toBe(
      'sharepic'
    );
    expect(
      parseClassifierResponse('{"intent": "examples", "intent": "social_post"', 'x').intent
    ).toBe('social_post');
  });

  it('carries the user text only for intents that search it', () => {
    expect(parseClassifierResponse(malformed('search'), 'Windkraft Bayern').searchQuery).toBe(
      'Windkraft Bayern'
    );
    // A create turn reads the message itself; a stray query is only noise.
    expect(parseClassifierResponse(malformed('create_sheet'), 'Windkraft Bayern').searchQuery).toBe(
      null
    );
  });
});
