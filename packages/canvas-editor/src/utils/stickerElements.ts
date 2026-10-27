/**
 * The canvas editor's emoji and icon catalogues for the sticker creator: the
 * same Noto set and Iconify sets, the same German-aware ranking.
 */
export { EMOJI_ASSETS } from '../brand/grueneAssetCatalog';
export { type UniversalAsset } from '@ggraphic/editor/utils/canvasAssets';
export {
  DEFAULT_ICON_SET,
  generateIconDataUrl,
  loadAllIcons,
  loadIconSetCatalog,
  type IconDef,
} from '@ggraphic/editor/utils/canvasIcons';
export {
  loadEmojiCatalog,
  type EmojiCatalogEntry,
  type EmojiCatalogGroup,
} from './emoji/emojiCatalog';
export { rankByQuery } from '@ggraphic/editor/utils/filterUtils';
