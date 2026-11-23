/**
 * Registers the canvas editor's host data: stickers, emoji and logos (asset
 * catalog), the brand packs, and the Grünerator host seams. @ggraphic/editor
 * reads them at render time, including offscreen renders (chat previews,
 * /mobile-render) that run without any React context.
 *
 * Side-effect module, evaluated once per page like every ES module. Every file
 * in apps/web that imports the canvas stack at runtime imports this first
 * (`import '…/canvasHost';`), so the data loads with the first lazy canvas
 * chunk instead of in the entry's static closure (#5891).
 * `canvasHost.vitest.ts` enforces the import.
 */
import {
  GRUENE_ASSET_CATALOG,
  registerAssetCatalog,
} from '@gruenerator/canvas-editor/grueneAssetCatalog';
import {
  GRUENE_BRAND_PACKS,
  registerBrandPacks,
} from '@gruenerator/canvas-editor/grueneBrandPacks';
import { registerGrueneHostSeams } from '@gruenerator/canvas-editor/grueneHostSeams';

registerAssetCatalog(GRUENE_ASSET_CATALOG);
registerBrandPacks(GRUENE_BRAND_PACKS);
registerGrueneHostSeams();
