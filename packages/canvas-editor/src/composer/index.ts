export {
  composeSharepic,
  wrapWords,
  SHAREPIC_COLOR_HEX,
  type ComposeOptions,
  type ComposedSharepic,
  type ComposedSlide,
  type MeasureText,
  type PhotoTone,
} from './composeSharepic';
export { deckPages, deckSpec, readSharepicSource } from '../collab/sharepicSource';
export { applySharepicPatch, type PatchResult } from './applySharepicPatch';
export { type SharepicProvenance, type SharepicProvenanceLift } from './sharepicProvenance';
export {
  baselineProvenance,
  elementIdForKey,
  editDistance,
  elementKey,
  fingerprint,
  liftPage,
  recomposePage,
  textLeaves,
  type LiftedSharepicPage,
  type RecomposedSharepicPage,
  type RecomposedSlide,
  type SharepicElementKey,
  type SharepicForeignElement,
  type SharepicOverride,
  type SharepicPageCollection,
  type SharepicStyleProps,
} from './liftSharepicPage';
// Measure after the brand faces load, or text wraps by the fallback font's widths.
export { ensureFontsReady } from '../utils/ensureFontsReady';
export {
  applySharepicTweaks,
  sharepicTweaks,
  type SharepicTweak,
  type SharepicTweakChoice,
  type SharepicTweakId,
  type SharepicTweakOption,
} from './sharepicTweaks';
