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
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import {
  NOTEBOOK_REGISTRY,
  isNotebookOfferedIn,
  isNotebookResolvableIn,
  type NotebookAudience,
  type NotebookCategory,
  type NotebookDefinition,
  type NotebookId,
} from '@gruenerator/shared/notebooks';

import { CURRENT_INSTANCE } from '../../../config/instance';

import type { SystemAgentId } from '@gruenerator/shared/agents';
import type { IconType } from 'react-icons';

// Re-export so existing consumers can keep importing the category union from here.
export type { NotebookCategory };

export interface NotebookConfigEntry {
  id: string;
  path: string;
  title: string;
  description: string;
  meta: string;
  tags: string[];
  icon: IconType;
  order: number;
  category: NotebookCategory;
  audience: NotebookAudience;
  /**
   * Branded 1:1 cover shown in the gallery tile (public path). Absent notebooks
   * fall back to the ghost-icon preview.
   */
  coverImage?: string;
  /**
   * When false, the notebook is hidden from gallery listings and category helpers.
   * Direct lookups by id/path still return the entry so routes don't 404 mid-session,
   * but the backend `notebookCollectionMap.DISABLED_NOTEBOOK_IDS` should match and
   * reject queries against the notebook. Defaults to true when omitted.
   */
  enabled?: boolean;
  /**
   * When set, entering this notebook pre-selects the given agent in the global
   * chat store, so that navigating to /chat afterwards opens the LV-tuned agent.
   * Typed as `SystemAgentId` so renames in `system.ts` fail at compile time
   * across every notebook reference.
   */
  defaultAgent?: SystemAgentId;
}

/**
 * Web-only routing paths. Kept here (not in the shared registry) because they're a web
 * concern and irregular — `gruenerator → /notebooks`, `gruene → /notebooks/grundsatz` —
 * so they can't be derived from the id. `satisfies Record<NotebookId, string>` forces a
 * path for every registered notebook.
 */
const NOTEBOOK_PATHS = {
  'gruenerator-notebook': '/notebooks',
  'gruene-notebook': '/notebooks/grundsatz',
  'bundestagsfraktion-notebook': '/notebooks/bundestagsfraktion',
  'hamburg-notebook': '/notebooks/hamburg',
  'schleswig-holstein-notebook': '/notebooks/schleswig-holstein',
  'thueringen-notebook': '/notebooks/thueringen',
  'berlin-notebook': '/notebooks/berlin',
  'mecklenburg-vorpommern-notebook': '/notebooks/mecklenburg-vorpommern',
  'brandenburg-notebook': '/notebooks/brandenburg',
  'bayern-notebook': '/notebooks/bayern',
  'sachsen-anhalt-notebook': '/notebooks/sachsen-anhalt',
  'hessen-notebook': '/notebooks/hessen',
  'saarland-notebook': '/notebooks/saarland',
  'oesterreich-notebook': '/notebooks/oesterreich',
  'kommunalwiki-notebook': '/notebooks/kommunalwiki',
  'gruenblog-notebook': '/notebooks/gruenblog',
  'abgeordnetenwatch-notebook': '/notebooks/abgeordnetenwatch',
  'boell-stiftung-notebook': '/notebooks/boell-stiftung',
} satisfies Record<NotebookId, string>;

/**
 * Branded notebook covers, optimized webp. The files live in
 * `packages/shared/assets/notebook-covers/` so web and mobile share one copy —
 * Vite turns these imports into hashed URLs, Metro into bundled image modules.
 * Partial by design: notebooks without an entry keep the ghost-icon tile.
 */
const NOTEBOOK_COVERS: Partial<Record<NotebookId, string>> = {
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

const toEntry = (nb: NotebookDefinition): NotebookConfigEntry => ({
  id: nb.id,
  path: NOTEBOOK_PATHS[nb.id],
  title: nb.title,
  description: nb.description,
  meta: nb.meta,
  tags: nb.tags,
  icon: NOTEBOOK_ICONS[nb.id],
  order: nb.order,
  category: nb.category,
  audience: nb.audience,
  ...(NOTEBOOK_COVERS[nb.id] ? { coverImage: NOTEBOOK_COVERS[nb.id] } : {}),
  ...(nb.enabled === false ? { enabled: false } : {}),
  ...(nb.defaultAgent ? { defaultAgent: nb.defaultAgent as SystemAgentId } : {}),
});

/**
 * Every registered notebook, unfiltered — the resolution list.
 *
 * Route lookups read from here (via `getNotebookById` / `getNotebookByPath`)
 * because an instance that merely *hides* a notebook must not break a link
 * shared from another instance. Nothing renders a listing off this array; that
 * is what {@link SYSTEM_NOTEBOOKS} is for.
 */
const ALL_SYSTEM_NOTEBOOKS: NotebookConfigEntry[] = NOTEBOOK_REGISTRY.map(toEntry);

/**
 * Derived from the shared notebook registry (`@gruenerator/shared/notebooks`) so the web
 * gallery, mobile gallery, and chat mention picker stay in sync. Notebooks this instance
 * does not offer — by channel or by its content policy — are dropped here, the single
 * point every gallery view below inherits from.
 */
export const SYSTEM_NOTEBOOKS: NotebookConfigEntry[] = ALL_SYSTEM_NOTEBOOKS.filter((nb) =>
  isNotebookOfferedIn(nb.id, CURRENT_INSTANCE)
);

const isNotebookEnabled = (nb: NotebookConfigEntry): boolean => nb.enabled !== false;

export const getOrderedNotebooks = (): NotebookConfigEntry[] =>
  SYSTEM_NOTEBOOKS.filter(isNotebookEnabled).sort((a, b) => a.order - b.order);

/**
 * Direct-link resolution: `hidden` still resolves, `blocked` does not. Mirrors
 * the backend gate in `apps/api/config/notebookCollectionMap.ts`, which lets an
 * explicitly mentioned notebook through on the same terms.
 */
export const getNotebookById = (id: string): NotebookConfigEntry | undefined =>
  ALL_SYSTEM_NOTEBOOKS.find(
    (nb) => nb.id === id && isNotebookResolvableIn(nb.id, CURRENT_INSTANCE)
  );

export const getNotebookByPath = (path: string): NotebookConfigEntry | undefined =>
  ALL_SYSTEM_NOTEBOOKS.find(
    (nb) => nb.path === path && isNotebookResolvableIn(nb.id, CURRENT_INSTANCE)
  );

export const getNotebooksByCategory = (category: NotebookCategory): NotebookConfigEntry[] =>
  SYSTEM_NOTEBOOKS.filter((nb) => isNotebookEnabled(nb) && nb.category === category).sort(
    (a, b) => a.order - b.order
  );

/**
 * Audience gate mirroring `getNotebooksForAudience` in the shared registry:
 * a notebook is visible when tagged for the viewer's locale or for `all`.
 * Category-based grouping (`landesebene`, `oesterreich`, …) decides *where* a
 * notebook renders; this decides *whether* it renders for the viewer at all.
 */
export const isNotebookVisibleForLocale = (
  nb: NotebookConfigEntry,
  locale: Exclude<NotebookAudience, 'all'>
): boolean => nb.audience === 'all' || nb.audience === locale;

export const getGermanNotebooks = (): NotebookConfigEntry[] =>
  SYSTEM_NOTEBOOKS.filter(
    (nb) =>
      isNotebookEnabled(nb) && (nb.category === 'bundesebene' || nb.category === 'landesebene')
  ).sort((a, b) => a.order - b.order);

export const getAustrianNotebooks = (): NotebookConfigEntry[] =>
  getNotebooksByCategory('oesterreich');

/**
 * Reverse-map: agent identifier → notebooks whose `defaultAgent` points at it.
 * Iterates SYSTEM_NOTEBOOKS (not getOrderedNotebooks) so disabled-but-routable
 * notebooks like Schleswig-Holstein still produce an entry. Map key is `string`
 * (not `SystemAgentId`) so callers can look up by arbitrary agent identifiers —
 * population side is already typed via `NotebookConfigEntry.defaultAgent`.
 */
export const getNotebooksByDefaultAgent = (): ReadonlyMap<string, NotebookConfigEntry[]> => {
  const map = new Map<string, NotebookConfigEntry[]>();
  for (const nb of SYSTEM_NOTEBOOKS) {
    if (!nb.defaultAgent) continue;
    const list = map.get(nb.defaultAgent) ?? [];
    list.push(nb);
    map.set(nb.defaultAgent, list);
  }
  return map;
};
