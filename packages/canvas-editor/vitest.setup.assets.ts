import { GRUENE_ASSET_CATALOG, registerAssetCatalog } from './src/brand/grueneAssetCatalog';
import { GRUENE_BRAND_PACKS, registerBrandPacks } from './src/brand/grueneBrandPacks';

// The editor's tests are the Grünerator's: they run on its asset catalogue
// and brand packs, as apps/web does from startup (`apps/web/src/index.tsx`).
registerAssetCatalog(GRUENE_ASSET_CATALOG);
registerBrandPacks(GRUENE_BRAND_PACKS);
