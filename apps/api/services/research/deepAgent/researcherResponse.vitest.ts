import { describe, expect, it } from 'vitest';

import {
  CONFIDENCE_LEVELS,
  RESEARCHER_RESPONSE_SCHEMA,
  researcherResponseFormat,
} from './researcherResponse.js';

describe('researcherResponseFormat', () => {
  /**
   * Measured against the real `ToolStrategy`, not asserted from the schema
   * literal: the strategy is what the model is actually handed, and a schema
   * shape LangChain refuses would only show up here.
   */
  it('compiles into a tool the model can be asked for', () => {
    const strategy = researcherResponseFormat();

    expect(strategy.tool.type).toBe('function');
    expect(typeof strategy.name).toBe('string');
    expect(strategy.name.length).toBeGreaterThan(0);
  });

  it('parses a well-formed answer', () => {
    const parsed = researcherResponseFormat().parse({
      ergebnis: 'Die Debatte begann 2024.',
      quellen: [{ titel: 'Bericht', url: 'https://example.org' }],
      luecken: [],
      belastbarkeit: 'hoch',
    });

    expect(parsed.ergebnis).toBe('Die Debatte begann 2024.');
  });

  /**
   * Every instance carries its own tool. Sharing one across both subagents
   * would put the same object into two agents — cheap to get wrong, and the
   * kind of thing that surfaces only under concurrent delegation.
   */
  it('is built fresh per subagent', () => {
    expect(researcherResponseFormat()).not.toBe(researcherResponseFormat());
  });
});

describe('the schema', () => {
  it('separates the prose from the sources', () => {
    // The whole point: the source block stops being something the prompt asks
    // for inside a text and becomes its own field.
    expect(RESEARCHER_RESPONSE_SCHEMA.required).toContain('ergebnis');
    expect(RESEARCHER_RESPONSE_SCHEMA.required).toContain('quellen');
  });

  it('lets a source exist without a URL', () => {
    // Notebook hits regularly have none, and an invented address is the one
    // failure mode the whole source handling is built to prevent.
    const source = RESEARCHER_RESPONSE_SCHEMA.properties.quellen.items;

    expect(source.required).toEqual(['titel']);
    expect(Object.keys(source.properties)).toContain('notebook');
  });

  it('demands gaps as a field rather than a sentence', () => {
    // This is what the lead re-delegates from — inferring it from prose was
    // the step that got skipped.
    expect(RESEARCHER_RESPONSE_SCHEMA.required).toContain('luecken');
    expect(RESEARCHER_RESPONSE_SCHEMA.properties.luecken.type).toBe('array');
  });

  it('keeps confidence a closed set', () => {
    expect(RESEARCHER_RESPONSE_SCHEMA.properties.belastbarkeit.enum).toEqual([
      ...CONFIDENCE_LEVELS,
    ]);
  });
});
