/**
 * The Grünerator's brand packs for the editor, DE first: new elements take
 * their defaults from it in both countries, as they did before the defaults
 * became pack data. apps/web installs them at startup (`registerBrandPacks`).
 */
import { GRUENE_AT, GRUENE_DE } from './theme';

export const GRUENE_BRAND_PACKS = [GRUENE_DE, GRUENE_AT] as const;

export { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
