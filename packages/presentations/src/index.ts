export { PresentationEditor, type PresentationEditorApi } from './components/PresentationEditor.js';
// NB: PresentMode is intentionally NOT re-exported here — it is the only module
// that imports reveal.js + its CSS. Import it lazily via the '@gruenerator/
// presentations/present' subpath so reveal lands in its own chunk.
export { SlideSurface } from './components/SlideSurface.js';
export { useSlides, type UseSlidesResult } from './collab/useSlides.js';
export { buildBlankDeckSlides } from './lib/blankDeck.js';
export {
  PRESENTATION_YDOC_KEYS,
  PRESENTATION_META_KEYS,
  PRESENTATION_SCHEMA_VERSION,
  PRESENTATION_LOCAL_ORIGIN,
  PRESENTATION_SEED_ORIGIN,
  getSlidesArray,
  getMetaMap,
  slideToYMap,
  yMapToSlide,
} from './lib/ydocSchema.js';
export { serializePresentationContext } from './ai/serializePresentationContext.js';
export { applyPresentationOperations, type ApplyResult } from './ai/applyPresentationOperations.js';
