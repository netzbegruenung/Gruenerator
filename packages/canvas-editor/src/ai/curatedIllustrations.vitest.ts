import { describe, it, expect } from 'vitest';

import { buildIllustrationCapability } from './illustrationCapability';

// The curated {id, label} pairs are baked statically so the AI capability
// module never pulls the ~280 KB undraw catalog into an eager chunk. This
// test keeps them honest: every curated id must still resolve against the
// real catalog, so a registry rename can't silently degrade the AI surface.
describe('curated AI illustration ids', () => {
  it('every curated id exists in the illustration catalog', async () => {
    const { UNDRAW_ALL } = await import('../utils/illustrations/undrawAll');
    const { OPENDOODLES } = await import('../utils/illustrations/opendoodles');
    const knownIds = new Set([...UNDRAW_ALL, ...OPENDOODLES].map((def) => def.id));

    for (const option of buildIllustrationCapability()) {
      expect(knownIds.has(option.id), `unknown illustration id: ${option.id}`).toBe(true);
    }
  });
});
