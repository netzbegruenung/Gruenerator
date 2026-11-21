import { describe, expect, it } from 'vitest';

import { COLLAB_SUBTYPES, DOCS_ONLY_SUBTYPES, OFFICE_SUBTYPES } from './constants.js';

describe('video subtype', () => {
  it('is a collaborative subtype but stays out of docs and office listings', () => {
    expect(COLLAB_SUBTYPES).toContain('video');
    expect(DOCS_ONLY_SUBTYPES).not.toContain('video');
    expect(OFFICE_SUBTYPES).not.toContain('video');
  });
});
