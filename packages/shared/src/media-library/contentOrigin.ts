/**
 * Which product made an image: the Studio gallery splits "Sharepics" from
 * "KI-Bilder" on it.
 *
 * The authoritative answer is `shared_media.content_origin`, set server-side at
 * insert time. What lives here is the *fallback* for rows written before that
 * column existed — and the derivation the API runs when a client too old to send
 * `contentOrigin` creates a share.
 *
 * Before this module the same allow-list existed twice, once in
 * `apps/web/.../StudioGallerySections.tsx` and once in
 * `apps/mobile/hooks/studioMediaMapping.ts`, and both had to be edited whenever a
 * KI type shipped. Deliberately NOT derived from web's `typeConfig` registry: the
 * API must be able to import this, and that registry does far more than this one
 * classification.
 */

export type ContentOrigin = 'ki' | 'sharepic' | 'upload' | 'unknown';

/** What a client may declare when creating a share. */
export type DeclarableContentOrigin = 'ki' | 'sharepic';

/**
 * Canonical KI type ids written by the bild-editor, plus the two legacy aliases
 * the Bilder tab wrote before the rename. Keep in step with the KI block of
 * web's `IMAGE_STUDIO_TYPES` — a KI type missing here lands in the Sharepics
 * section for legacy rows; it never disappears from the page.
 */
const KI_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'green-edit',
  'universal-edit',
  'pure-create',
  'ai-editor',
  'imagine',
  'edit',
]);

/**
 * Template sharepics, in the two spellings the write paths actually produced.
 *
 * The PascalCase names are the `legacyType` values the image-studio template
 * flow wrote. The lowercase ids are what the canvas editor writes instead — it
 * passes the canvas config id straight through as `image_type`, a different
 * namespace for the same templates. Rows in the second spelling were classified
 * as neither before, which is why they turned up among the sharepics only by
 * accident of the default.
 *
 * Deliberately absent: the literal `'sharepic'`. Mobile's share modal writes it
 * for KI results and template results alike, so it certifies nothing — those
 * rows stay `'unknown'`, which is where they belong and where a later pass can
 * find them.
 */
const TEMPLATE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  // image-studio legacyType
  'Dreizeilen',
  'Zitat',
  'Zitat_Pure',
  'Info',
  'Simple',
  'Slider',
  'Veranstaltung',
  'Profilbild',
  'Freeform',
  'InfoAt',
  'ZitatAt',
  'ZitatPureAt',
  'DreizeilenAt',
  'DreizeilenOverlayAt',
  'InfoAt',
  'FreeformAt',
  // canvas config ids
  'dreizeilen',
  'zitat',
  'zitat-pure',
  'info',
  'simple',
  'slider',
  'veranstaltung',
  'profilbild',
  'freeform',
  'info-at',
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
]);

/**
 * Classify a legacy `image_type` string.
 *
 * Returns `'unknown'` rather than guessing for anything unrecognised — including
 * the empty string, which is what the draft autosave sent whenever it fired
 * before the studio type was set. Callers decide what an unknown row looks like;
 * today both galleries show it among the sharepics, as they always have.
 */
export function classifyLegacyImageType(imageType?: string | null): ContentOrigin {
  if (!imageType) return 'unknown';
  if (KI_IMAGE_TYPES.has(imageType)) return 'ki';
  if (TEMPLATE_IMAGE_TYPES.has(imageType)) return 'sharepic';
  return 'unknown';
}

/**
 * Does this image belong in the KI section?
 *
 * `contentOrigin` wins whenever the backend sent one. It is absent only against a
 * backend that predates the column, and then the legacy classification applies —
 * which is exactly what both galleries did before.
 */
export function isKiImage(item: {
  contentOrigin?: string | null;
  imageType?: string | null;
}): boolean {
  if (item.contentOrigin != null) return item.contentOrigin === 'ki';
  return classifyLegacyImageType(item.imageType) === 'ki';
}
