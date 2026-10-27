import { beforeAll } from 'vitest';

// The render lane draws the Grünerator's own kinds (the Balken), as the
// package entry does for apps/web (`src/index.ts`); tests import modules
// directly, past that entry. Imported in `beforeAll`, after the test file:
// a static import here would load the editor graph before the file's
// `vi.mock` calls, and those mocks would never apply. Only in this lane: the
// node lane renders nothing.
beforeAll(async () => {
  const { GRUENE_KIND_RENDERERS, registerKindRenderers } = await import('./src/brand/grueneKinds');
  registerKindRenderers(GRUENE_KIND_RENDERERS);
});
