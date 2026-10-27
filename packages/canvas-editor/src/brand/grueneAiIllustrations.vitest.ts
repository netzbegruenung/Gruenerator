import { describe, it, expect } from 'vitest';

import { GRUENE_AI_ILLUSTRATIONS } from './grueneAiIllustrations';

// The curated {id, label} pairs are baked statically so the AI capability
// module never pulls the ~280 KB undraw catalog into an eager chunk. This
// test keeps them honest: every curated id must still resolve against the
// real catalog, so a registry rename can't silently degrade the AI surface.
describe('curated AI illustration ids', () => {
  it('every curated id exists in the illustration catalog', async () => {
    const { UNDRAW_ALL } = await import('../utils/illustrations/undrawAll');
    const { OPENDOODLES } = await import('@ggraphic/editor/utils/illustrations/opendoodles');
    const knownIds = new Set([...UNDRAW_ALL, ...OPENDOODLES].map((def) => def.id));

    for (const option of GRUENE_AI_ILLUSTRATIONS) {
      expect(knownIds.has(option.id), `unknown illustration id: ${option.id}`).toBe(true);
    }
  });
});
