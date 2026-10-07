/**
 * Which parts of a page's state carry over when adding a page or converting
 * it to another template. One module so every path (add, setPageConfig)
 * shares the same contract.
 */

import { COMPOSER_PLANE_IDS, type ShapeInstance } from '../utils/shapes';

/** Templates that draw the composer's background planes as free shapes. */
const PLANE_TEMPLATES: readonly string[] = ['freeform', 'freeform-at'];

/** Value-carrying keys copied verbatim when present on the source page. */
const INHERITABLE_KEYS = [
  'backgroundColor',
  'imageOffset',
  'imageScale',
  'backgroundImageOpacity',
  'imageAttribution',
  'colorScheme',
  'colorSchemeId',
  'backgroundMode',
] as const;

export function extractInheritablePageState(
  state: Record<string, unknown>,
  /** The template the new page uses; decides what happens to composer planes. */
  targetConfigId?: string
): Record<string, unknown> {
  const inherited: Record<string, unknown> = {};

  // Image background source — templates read it under either key, so mirror
  // whichever one is set into both.
  const imageSrc = state.currentImageSrc || state.imageSrc;
  if (imageSrc) {
    inherited.currentImageSrc = imageSrc;
    inherited.imageSrc = imageSrc;
  }

  for (const key of INHERITABLE_KEYS) {
    if (state[key] !== undefined && state[key] !== null && state[key] !== '') {
      inherited[key] = state[key];
    }
  }

  // Cross-template rule: a source with an image background but no explicit
  // mode (zitat, dreizeilen, …) lands in mode-aware templates (freeform) as
  // an image page, not the 'color' default.
  if (imageSrc && !state.backgroundMode) {
    inherited.backgroundMode = 'image';
  }

  // A composed sharepic's background is more than the keys above: a gradient
  // (`sc-bg`), the colour beside a photo strip (`sc-panel`, with the photo
  // shifted into the strip via imageOffset), the AT strip tint and the photo
  // scrim are locked shapes. Without them a new page from a strip slide shows
  // a blank band where the panel was, and one from a gradient slide is flat.
  const shapes = Array.isArray(state.shapeInstances)
    ? (state.shapeInstances as ShapeInstance[])
    : [];
  const planes = shapes.filter((shape) => COMPOSER_PLANE_IDS.includes(shape.id));
  if (planes.length > 0 && targetConfigId && PLANE_TEMPLATES.includes(targetConfigId)) {
    inherited.shapeInstances = planes.map((plane) => ({ ...plane }));
    const order = Array.isArray(state.layerOrder) ? (state.layerOrder as string[]) : [];
    const ids = planes.map((plane) => plane.id);
    inherited.layerOrder = [
      ...order.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !order.includes(id)),
    ];
  } else if (planes.some((plane) => plane.id === 'sc-panel')) {
    // Another template lays out its own content, which free planes would
    // cover; it gets the photo back centred instead of shifted towards a
    // panel it does not have.
    delete inherited.imageOffset;
    delete inherited.imageScale;
  }

  return inherited;
}
