import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import {
  NOTEBOOK_REGISTRY,
  type NotebookCategory,
  type NotebookDefinition,
  type NotebookId,
} from '@gruenerator/shared/notebooks';

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
  'oesterreich-notebook': '/notebooks/oesterreich',
  'kommunalwiki-notebook': '/notebooks/kommunalwiki',
  'gruenblog-notebook': '/notebooks/gruenblog',
  'boell-stiftung-notebook': '/notebooks/boell-stiftung',
} satisfies Record<NotebookId, string>;

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
  ...(nb.enabled === false ? { enabled: false } : {}),
  ...(nb.defaultAgent ? { defaultAgent: nb.defaultAgent as SystemAgentId } : {}),
});

/**
 * Derived from the shared notebook registry (`@gruenerator/shared/notebooks`) so the web
 * gallery, mobile gallery, and chat mention picker stay in sync. `devOnly` notebooks are
 * included only in dev builds, matching the previous DEV_ONLY_NOTEBOOKS behaviour.
 */
export const SYSTEM_NOTEBOOKS: NotebookConfigEntry[] = NOTEBOOK_REGISTRY.filter(
  (nb) => import.meta.env.DEV || !nb.devOnly
).map(toEntry);

const isNotebookEnabled = (nb: NotebookConfigEntry): boolean => nb.enabled !== false;

export const getOrderedNotebooks = (): NotebookConfigEntry[] =>
  SYSTEM_NOTEBOOKS.filter(isNotebookEnabled).sort((a, b) => a.order - b.order);

export const getNotebookById = (id: string): NotebookConfigEntry | undefined =>
  SYSTEM_NOTEBOOKS.find((nb) => nb.id === id);

export const getNotebookByPath = (path: string): NotebookConfigEntry | undefined =>
  SYSTEM_NOTEBOOKS.find((nb) => nb.path === path);

export const getNotebooksByCategory = (category: NotebookCategory): NotebookConfigEntry[] =>
  SYSTEM_NOTEBOOKS.filter((nb) => isNotebookEnabled(nb) && nb.category === category).sort(
    (a, b) => a.order - b.order
  );

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
