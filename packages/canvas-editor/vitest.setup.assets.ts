import { GRUENE_ASSET_CATALOG, registerAssetCatalog } from './src/brand/grueneAssetCatalog';

// The editor's tests are the Grünerator's: they run on its asset catalogue,
// as apps/web does from startup (`apps/web/src/index.tsx`).
registerAssetCatalog(GRUENE_ASSET_CATALOG);
