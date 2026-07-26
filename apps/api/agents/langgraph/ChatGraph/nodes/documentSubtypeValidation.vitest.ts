import { describe, it, expect } from 'vitest';

import { CLASSIFIER_DOC_SUBTYPES } from './classifierPrompt.js';
import { parseClassifierResponse } from './classifierParsing.js';

/**
 * The classifier's `documentSubtype` travels downstream as `subtypeOverride`,
 * which WINS over the document generator's own validated subtype. An invented
 * value therefore reaches the INSERT, where only the DB check constraint stops
 * it — the turn fails and the chat says nothing. Validate at the source.
 */

describe('classifier documentSubtype validation', () => {
  it('drops a value the model invented outside the allowed set', () => {
    const response = JSON.stringify({
      intent: 'save_as_doc',
      documentSubtype: 'brief',
      reasoning: 'save',
    });

    const result = parseClassifierResponse(response, 'Schreib mir einen Brief als Dokument');

    expect(result.intent).toBe('save_as_doc');
    expect(result.documentSubtype).toBeNull();
  });

  it('keeps every subtype the prompt actually offers', () => {
    for (const subtype of CLASSIFIER_DOC_SUBTYPES) {
      const response = JSON.stringify({
        intent: 'save_as_doc',
        documentSubtype: subtype,
        reasoning: 'save',
      });

      expect(parseClassifierResponse(response, 'Speichern').documentSubtype).toBe(subtype);
    }
  });

  it('treats a missing subtype as null rather than inventing one', () => {
    const response = JSON.stringify({ intent: 'save_as_doc', reasoning: 'save' });

    expect(parseClassifierResponse(response, 'Speichern').documentSubtype).toBeNull();
  });
});
