/**
 * The canvas editor's emoji and icon catalogues for the sticker creator: the
 * same Noto set and Iconify sets, the same German-aware ranking.
 */
export { EMOJI_ASSETS, type UniversalAsset } from './canvasAssets';
export {
  DEFAULT_ICON_SET,
  generateIconDataUrl,
  loadAllIcons,
  loadIconSetCatalog,
  type IconDef,
} from './canvasIcons';
export {
  loadEmojiCatalog,
  type EmojiCatalogEntry,
  type EmojiCatalogGroup,
} from './emoji/emojiCatalog';
export { rankByQuery } from './filterUtils';
