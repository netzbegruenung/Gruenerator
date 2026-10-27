import { GRUENE_KIND_RENDERERS, registerKindRenderers } from './src/brand/grueneKinds';

// The render lane draws the Grünerator's own kinds (the Balken), as the
// package entry does for apps/web (`src/index.ts`); tests import modules
// directly, past that entry. Only here: the node lane renders nothing, and the
// renderers would pull the whole Konva graph into its setup.
registerKindRenderers(GRUENE_KIND_RENDERERS);
