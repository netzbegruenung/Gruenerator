import { describe, expect, it } from 'vitest';

import {
  ANSWER_TOOL_NAME,
  CONFIDENCE_LEVELS,
  researcherAnswerTool,
  researcherResponseSchema,
} from './researcherResponse.js';

const GOOD = {
  ergebnis: 'Wien strebt Klimaneutralität bis 2040 an.',
  quellen: [{ titel: 'Stadt Wien', url: 'https://wien.gv.at' }],
  luecken: ['Wie wird der Fortschritt gemessen?'],
  belastbarkeit: 'mittel',
};

describe('the answer tool', () => {
  it('is the name the prompt tells the researchers to use', () => {
    expect(ANSWER_TOOL_NAME).toBe('antwort_geben');
  });

  it('accepts a well-formed answer', () => {
    expect(researcherResponseSchema.parse(GOOD)).toEqual(GOOD);
    expect(researcherAnswerTool().inputSchema).toBe(researcherResponseSchema);
  });
});

describe('the schema', () => {
  it('separates the prose from the sources', () => {
    expect(researcherResponseSchema.safeParse({ ...GOOD, quellen: undefined }).success).toBe(false);
    expect(researcherResponseSchema.safeParse({ ...GOOD, ergebnis: undefined }).success).toBe(
      false
    );
  });

  it('lets a source exist without a URL', () => {
    // Notebook hits often have no public address; an invented one is worse.
    const answer = { ...GOOD, quellen: [{ titel: 'Beschluss', notebook: 'Berlin' }] };
    expect(researcherResponseSchema.safeParse(answer).success).toBe(true);
  });

  it('demands gaps as a field rather than a sentence', () => {
    expect(researcherResponseSchema.safeParse({ ...GOOD, luecken: undefined }).success).toBe(false);
  });

  it('keeps confidence a closed set', () => {
    expect(CONFIDENCE_LEVELS).toEqual(['hoch', 'mittel', 'gering']);
    expect(
      researcherResponseSchema.safeParse({ ...GOOD, belastbarkeit: 'sehr hoch' }).success
    ).toBe(false);
  });
});
