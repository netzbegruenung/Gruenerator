import type { CanvasConfigId } from './configs/types';

// Background-image fields that must sync back to the collab doc when changed
// in-editor (GenericCanvas emits the matching on<Key>Change). Without these
// the chosen image — and its position/zoom/opacity/credit — is local-only
// and lost on reload. `currentImageSrc` is the persisted key for every type.
const BG_IMAGE_KEYS = [
  'currentImageSrc',
  'imageOffset',
  'imageScale',
  'backgroundImageOpacity',
  'imageAttribution',
] as const;

/**
 * The state keys CanvasEditorRouter declares an `on<Key>Change` callback for,
 * per canvas type. Template text fields and the background image live here;
 * the remaining persisted keys are minted per page (PAGE_PERSISTED_STATE_KEYS).
 */
export const HOST_CALLBACK_KEYS: Record<CanvasConfigId, readonly string[]> = {
  zitat: ['quote', 'name', ...BG_IMAGE_KEYS],
  'zitat-pure': ['quote', 'name', ...BG_IMAGE_KEYS],
  info: ['header', 'body', ...BG_IMAGE_KEYS],
  veranstaltung: ['eventTitle', 'beschreibung', ...BG_IMAGE_KEYS],
  simple: ['headline', 'subtext', ...BG_IMAGE_KEYS],
  slider: ['label', 'headline', 'subtext', ...BG_IMAGE_KEYS],
  'slider-at': ['label', 'headline', 'subtext', ...BG_IMAGE_KEYS],
  dreizeilen: ['line1', 'line2', 'line3', ...BG_IMAGE_KEYS],
  // backgroundMode must persist alongside the image — the background image
  // element only renders when backgroundMode === 'image'.
  freeform: ['backgroundMode', ...BG_IMAGE_KEYS],
  profilbild: [],
  'zitat-at': ['quote', 'name', ...BG_IMAGE_KEYS],
  'zitat-pure-at': ['quote', 'name', ...BG_IMAGE_KEYS],
  'dreizeilen-overlay-at': ['line1', 'accent', 'line3', 'subline', ...BG_IMAGE_KEYS],
  'info-at': ['introline', 'text', 'accent', ...BG_IMAGE_KEYS],
  'freeform-at': ['backgroundMode', 'backgroundColor', ...BG_IMAGE_KEYS],
};
