import coverBayern from '@gruenerator/shared/assets/notebook-covers/bayern.webp';
import coverBerlin from '@gruenerator/shared/assets/notebook-covers/berlin.webp';
import coverBrandenburg from '@gruenerator/shared/assets/notebook-covers/brandenburg.webp';
import coverBundestagsfraktion from '@gruenerator/shared/assets/notebook-covers/bundestagsfraktion.webp';
import coverBundesverband from '@gruenerator/shared/assets/notebook-covers/bundesverband.webp';
import coverHessen from '@gruenerator/shared/assets/notebook-covers/hessen.webp';
import coverKommunalwiki from '@gruenerator/shared/assets/notebook-covers/kommunalwiki.webp';
import coverMecklenburgVorpommern from '@gruenerator/shared/assets/notebook-covers/mecklenburg-vorpommern.webp';
import coverSaarland from '@gruenerator/shared/assets/notebook-covers/saarland.webp';
import coverSachsenAnhalt from '@gruenerator/shared/assets/notebook-covers/sachsen-anhalt.webp';
import coverThueringen from '@gruenerator/shared/assets/notebook-covers/thueringen.webp';

/**
 * Branded notebook covers, shared byte-for-byte with web: the files live in
 * `packages/shared/assets/notebook-covers/` and both apps point at them (web via
 * Vite URL imports in `features/notebook/config/notebooksConfig.ts`, mobile via
 * the Metro image modules below).
 *
 * The imports have to be static — Metro resolves an image at build time, so a
 * computed path would leave the asset out of the bundle. Partial by design: a
 * notebook without a cover keeps the icon tile.
 */
const NOTEBOOK_COVERS: Record<string, number> = {
  'gruene-notebook': coverBundesverband,
  'bundestagsfraktion-notebook': coverBundestagsfraktion,
  'thueringen-notebook': coverThueringen,
  'berlin-notebook': coverBerlin,
  'mecklenburg-vorpommern-notebook': coverMecklenburgVorpommern,
  'brandenburg-notebook': coverBrandenburg,
  'bayern-notebook': coverBayern,
  'sachsen-anhalt-notebook': coverSachsenAnhalt,
  'hessen-notebook': coverHessen,
  'saarland-notebook': coverSaarland,
  'kommunalwiki-notebook': coverKommunalwiki,
};

export function getNotebookCover(notebookId: string): number | null {
  return NOTEBOOK_COVERS[notebookId] ?? null;
}
