/**
 * Which parts of a page's state carry over when adding a page or converting
 * it to another template. One module so every path (add, setPageConfig)
 * shares the same contract.
 */

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
  state: Record<string, unknown>
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

  return inherited;
}
