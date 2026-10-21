/**
 * Free-text sharepic creator (experimental).
 *
 * The model never writes pixels or hex colours. It writes a `SharepicSpec` out
 * of building blocks — one slide, or a carousel of several — and the canvas
 * editor's composer turns each slide into an editable `freeform` page with the
 * brand's own layout rules. The vision review answers with patch operations
 * against the same spec.
 *
 * Texts may carry `==accent==` on single words (the editor's accent mark) and
 * `**bold**`. DE quotes, paragraphs and headlines may also carry up to two
 * `++marker++` passages (the marker box); AT sets those as `==accent==`.
 */

export {
  SHAREPIC_EMOJI,
  SHAREPIC_INFOGRAFIK_COLORS,
  SHAREPIC_LOCALE_COLORS,
  SHAREPIC_THEMA_COLORS,
  sharepicAlignSchema,
  sharepicAufrufStilSchema,
  sharepicBildAusschnittSchema,
  sharepicBildFilterSchema,
  sharepicChartKindSchema,
  sharepicColorSchema,
  sharepicColorsFor,
  sharepicCreatorLocaleSchema,
  sharepicEmojiCode,
  sharepicEmojiSchema,
  sharepicFormatSchema,
  sharepicHeadlineSizeSchema,
  sharepicIconSchema,
  sharepicInfografikFormSchema,
  sharepicListeStilSchema,
  sharepicNummerSchema,
  sharepicPositionSchema,
  sharepicRechenzeichenSchema,
  sharepicSeitenzahlSchema,
  sharepicTextSideSchema,
  sharepicThemaSchema,
  themaOfColor,
  sharepicVergleichStilSchema,
  sharepicZahlStilSchema,
} from './sharepicCreator/enums.js';
export type {
  SharepicAlign,
  SharepicAufrufStil,
  SharepicBildAusschnitt,
  SharepicBildFilter,
  SharepicChartKind,
  SharepicColor,
  SharepicCreatorLocale,
  SharepicEmoji,
  SharepicFormat,
  SharepicIcon,
  SharepicInfografikForm,
  SharepicNummer,
  SharepicPosition,
  SharepicSeitenzahl,
  SharepicTextSide,
  SharepicThema,
  SharepicVergleichStil,
} from './sharepicCreator/enums.js';
export {
  countMarkerPassages,
  hasUnpairedAccentMark,
  SHAREPIC_MARKER_PASSAGES,
  tightenAccentMarks,
  tightenAccentMarksDeep,
  unescapeLiteralNewlines,
} from './sharepicCreator/accentMarks.js';
export { SHAREPIC_LIMITS } from './sharepicCreator/limits.js';
export { accentLines } from './sharepicCreator/primitives.js';
export {
  isSharepicSceneRef,
  isSharepicUploadId,
  isSharepicVorlageRef,
  SHAREPIC_SCENE_REF,
  SHAREPIC_UPLOAD_ID,
  SHAREPIC_UPLOAD_MAX,
  SHAREPIC_VORLAGE_REF,
  sharepicVorlageAssetPath,
} from './sharepicCreator/refs.js';
export {
  SHAREPIC_COLOR_LABELS,
  SHAREPIC_ITEM_LABELS,
  SHAREPIC_REQUEST_BOUND_ITEMS,
  sharepicItemSchema,
} from './sharepicCreator/items.js';
export type {
  SharepicInfografikPunkt,
  SharepicItem,
  SharepicItemType,
} from './sharepicCreator/items.js';
export { namedSharepicSlides, sameSharepicContent } from './sharepicCreator/slideRefs.js';
export {
  sharepicBackgroundSchema,
  sharepicSlideSchema,
  slidePhotoFilename,
} from './sharepicCreator/slide.js';
export type { SharepicBackground, SharepicSlide } from './sharepicCreator/slide.js';
export { parseSharepicNumber, sharepicSpecSchema } from './sharepicCreator/spec.js';
export type { SharepicSpec } from './sharepicCreator/spec.js';
export { sharepicPatchOpSchema } from './sharepicCreator/patch.js';
export type { SharepicPatchOp } from './sharepicCreator/patch.js';
export {
  SHAREPIC_ELEMENT_KINDS,
  SHAREPIC_SOURCE_KEY,
  sharepicBackgroundFingerprintSchema,
  sharepicBaselineSchema,
  sharepicFingerprintSchema,
  sharepicPhotoAttributionSchema,
  sharepicSourceSchema,
  sharepicTweakChoiceSchema,
} from './sharepicCreator/source.js';
export type {
  SharepicBackgroundFingerprint,
  SharepicBaseline,
  SharepicFingerprint,
  SharepicPhotoAttribution,
  SharepicSource,
} from './sharepicCreator/source.js';
export {
  SHAREPIC_NEUTRAL_PHOTO_ANALYSIS,
  SHAREPIC_PHOTO_URL,
  sharepicAnalyzePhotoBodySchema,
  sharepicOwnPhotoSchema,
  sharepicPhotoAnalysisModelSchema,
  sharepicPhotoAnalysisSchema,
  sharepicPhotoFitSchema,
  sharepicPhotoUrlSchema,
} from './sharepicCreator/photos.js';
export type {
  SharepicOwnPhoto,
  SharepicPhotoAnalysis,
  SharepicPhotoFit,
} from './sharepicCreator/photos.js';
export {
  SHAREPIC_FORMS,
  sharepicFormLabel,
  sharepicFormSchema,
  sharepicFormStichworte,
} from './sharepicCreator/forms.js';
export type { SharepicFormId } from './sharepicCreator/forms.js';
export {
  parseSharepicChatProps,
  SHAREPIC_PROMPT_MAX,
  sharepicChatPropsSchema,
  sharepicCreatorErrorSchema,
  sharepicDraftBodySchema,
  sharepicDraftFailureReasonSchema,
  sharepicDraftFocusSchema,
  sharepicDraftResponseSchema,
  sharepicReviewBodySchema,
  sharepicReviewModeSchema,
  sharepicReviewResponseSchema,
} from './sharepicCreator/api.js';
export type {
  SharepicChatProps,
  SharepicCreatorError,
  SharepicDraftFailureReason,
  SharepicDraftFocus,
  SharepicDraftResponse,
  SharepicReviewMode,
  SharepicReviewResponse,
} from './sharepicCreator/api.js';
