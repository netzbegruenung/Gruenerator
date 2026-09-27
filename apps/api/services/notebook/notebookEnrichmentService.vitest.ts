import { describe, expect, it } from 'vitest';

import { alreadyEnriched } from './notebookEnrichmentService.js';

const enriched = {
  nlp_enriched_at: '2026-09-27T02:00:00.000Z',
  nlp_version: 3,
  content_hash: 'abc',
  nlp_content_hash: 'abc',
};

describe('alreadyEnriched', () => {
  it('skips a document stamped with the running persons version', () => {
    expect(alreadyEnriched({ ...enriched, nlp_persons_version: 1 }, 1)).toBe(true);
  });

  it('re-tags a document once the service reports newer person rules', () => {
    expect(alreadyEnriched({ ...enriched, nlp_persons_version: 1 }, 2)).toBe(false);
  });

  it('re-tags a document stamped before the service reported a version', () => {
    // Every payload written up to #3695 — the ones carrying photographer names.
    expect(alreadyEnriched(enriched, 1)).toBe(false);
  });

  it('does not churn while the running service predates the version field', () => {
    expect(alreadyEnriched({ ...enriched, nlp_persons_version: null }, null)).toBe(true);
    expect(alreadyEnriched(enriched, null)).toBe(true);
  });

  it('still re-tags on changed content', () => {
    expect(
      alreadyEnriched({ ...enriched, nlp_persons_version: 1, content_hash: 'changed' }, 1)
    ).toBe(false);
  });
});
