import { beforeAll } from 'vitest';

// The render lane draws the Grünerator's own kinds (the Balken), as the
// package entry does for apps/web (`src/index.ts`); tests import modules
// directly, past that entry. Imported in `beforeAll`, after the test file:
// a static import here would load the editor graph before the file's
// `vi.mock` calls, and those mocks would never apply. Only in this lane: the
// node lane renders nothing.
// The cold import of the editor graph can exceed the 10 s default hook budget
// on a loaded CI runner (two suites timed out here with ~100 workers spawned).
beforeAll(async () => {
  const { GRUENE_KIND_RENDERERS, registerKindRenderers } = await import('./src/brand/grueneKinds');
  registerKindRenderers(GRUENE_KIND_RENDERERS);
}, 60_000);
