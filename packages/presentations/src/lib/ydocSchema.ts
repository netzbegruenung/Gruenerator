// Moved to @gruenerator/contracts/presentations-ops so the API applies chat
// edits with the same code the editor runs.
export {
  PRESENTATION_YDOC_KEYS,
  PRESENTATION_META_KEYS,
  PRESENTATION_SCHEMA_VERSION,
} from '@gruenerator/contracts';
export {
  PRESENTATION_LOCAL_ORIGIN,
  PRESENTATION_SEED_ORIGIN,
  isCodeLayout,
  getSlidesArray,
  getMetaMap,
  getBodyFragment,
  newSlideId,
  yMapToSlide,
  slideToYMap,
  seedSlideBody,
  writeSlideBody,
  migrateSlideBodyForLayout,
  clearSlideBody,
  cloneSlideMap,
  clampInsert,
} from '@gruenerator/contracts/presentations-ops';
