/**
 * The Grünerator's brand packs for the editor, DE first: the first pack is the
 * fallback for a document that names none. An Austrian document names its own
 * (`FullCanvasConfig.brand`), so the order here never depends on the open
 * document. apps/web installs them at startup (`registerBrandPacks`).
 */
import { GRUENE_AT, GRUENE_DE } from './theme';

export const GRUENE_BRAND_PACKS = [GRUENE_DE, GRUENE_AT] as const;

export { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
