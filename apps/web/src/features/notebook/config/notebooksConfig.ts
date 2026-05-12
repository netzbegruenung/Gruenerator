import type { SystemAgentId } from '@gruenerator/shared/agents';
import { MdDiversity1 } from 'react-icons/md';
import {
  PiMagnifyingGlass,
  PiBooks,
  PiBank,
  PiMapPin,
  PiCompass,
  PiGlobe,
  PiNewspaper,
  PiTree,
  PiFlag,
  PiLightbulb,
  PiScales,
  PiFlowerLight,
} from 'react-icons/pi';

import type { IconType } from 'react-icons';

export type NotebookCategory = 'bundesebene' | 'landesebene' | 'weitere' | 'oesterreich';

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

const PRODUCTION_NOTEBOOKS: NotebookConfigEntry[] = [
  {
    id: 'gruenerator-notebook',
    path: '/notebooks',
    title: 'Grünerator',
    description: 'Durchsucht automatisch mehrere Quellen parallel und kombiniert die Ergebnisse.',
    meta: 'Mehrere Quellen',
    tags: ['Multi-Suche', 'Empfohlen'],
    icon: PiMagnifyingGlass,
    order: 0,
    category: 'bundesebene',
  },
  {
    id: 'gruene-notebook',
    path: '/notebooks/grundsatz',
    title: 'Bundesverband',
    description: 'Durchsuchbar sind die offiziellen Grundsatzprogramme von Bündnis 90/Die Grünen.',
    meta: '3 Programme',
    tags: ['Grundsatzprogramm', 'EU-Wahl', 'Regierung'],
    icon: PiBooks,
    order: 1,
    category: 'bundesebene',
  },
  {
    id: 'bundestagsfraktion-notebook',
    path: '/notebooks/bundestagsfraktion',
    title: 'Bundestagsfraktion',
    description:
      'Durchsuchbar sind die offiziellen Inhalte von gruene-bundestag.de – Fachtexte, politische Ziele und einfache Erklärungen.',
    meta: '542 Artikel',
    tags: ['Fachtexte', 'Ziele', 'Einfach erklärt'],
    icon: PiBank,
    order: 2,
    category: 'bundesebene',
  },
  {
    id: 'hamburg-notebook',
    path: '/notebooks/hamburg',
    title: 'Hamburg',
    description: 'Durchsuchbar sind Beschlüsse und Pressemitteilungen der Grünen Hamburg.',
    meta: 'Archiv',
    tags: ['Test', 'Hamburg', 'Beschlüsse', 'Presse'],
    icon: PiCompass,
    order: 4,
    category: 'landesebene',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-hamburg',
  },
  {
    id: 'schleswig-holstein-notebook',
    path: '/notebooks/schleswig-holstein',
    title: 'Schleswig-Holstein',
    description:
      'Durchsuchbar ist das Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl.',
    meta: '1 Programm',
    tags: ['Test', 'Schleswig-Holstein', 'Wahlprogramm'],
    icon: PiMapPin,
    order: 5,
    category: 'landesebene',
    enabled: false,
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-schleswig-holstein',
  },
  {
    id: 'thueringen-notebook',
    path: '/notebooks/thueringen',
    title: 'Thüringen',
    description:
      'Durchsuchbar sind Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen.',
    meta: 'Archiv',
    tags: ['Offiziell', 'Thüringen', 'Beschlüsse', 'Wahlprogramme', 'Presse'],
    icon: PiTree,
    order: 6,
    category: 'landesebene',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-thueringen',
  },
  {
    id: 'berlin-notebook',
    path: '/notebooks/berlin',
    title: 'Berlin',
    description:
      'Durchsuchbar sind Wahlprogramm 2026, Pressemitteilungen und Beschlüsse der Grünen Berlin.',
    meta: 'Archiv',
    tags: ['Berlin', 'Wahlprogramm', 'Beschlüsse', 'Presse'],
    icon: MdDiversity1,
    order: 7,
    category: 'landesebene',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-berlin',
  },
  {
    id: 'mecklenburg-vorpommern-notebook',
    path: '/notebooks/mecklenburg-vorpommern',
    title: 'Mecklenburg-Vorpommern',
    description:
      'Durchsuchbar sind Pressemitteilungen und Parteitagsbeschlüsse der Grünen Mecklenburg-Vorpommern.',
    meta: 'Archiv',
    tags: ['Mecklenburg-Vorpommern', 'Beschlüsse', 'Presse'],
    icon: PiFlag,
    order: 8,
    category: 'landesebene',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
  },
  {
    id: 'brandenburg-notebook',
    path: '/notebooks/brandenburg',
    title: 'Brandenburg',
    description:
      'Durchsuchbar sind Pressemitteilungen, Beschlüsse und das Landtagswahlprogramm 2024 der Brandenburger Bündnisgrünen.',
    meta: 'Archiv',
    tags: ['Brandenburg', 'Beschlüsse', 'Presse', 'Wahlprogramm'],
    icon: PiFlowerLight,
    order: 9,
    category: 'landesebene',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-brandenburg',
  },
  {
    id: 'oesterreich-notebook',
    path: '/notebooks/oesterreich',
    title: 'Die Grünen Österreich',
    description:
      'Durchsuchbar sind die offiziellen Programme von Die Grünen – Die Grüne Alternative Österreich.',
    meta: '3 Programme',
    tags: ['Österreich', 'Grundsatzprogramm', 'Nationalrat'],
    icon: PiGlobe,
    order: 3,
    category: 'oesterreich',
  },
  {
    id: 'kommunalwiki-notebook',
    path: '/notebooks/kommunalwiki',
    title: 'KommunalWiki',
    description:
      'Fachwissen zur Kommunalpolitik – durchsuchbar über das KommunalWiki der Heinrich-Böll-Stiftung.',
    meta: 'Wiki',
    tags: ['Kommunalpolitik', 'Böll-Stiftung'],
    icon: PiScales,
    order: 6,
    category: 'weitere',
  },
  {
    id: 'gruenblog-notebook',
    path: '/notebooks/gruenblog',
    title: 'Grünblog',
    description: 'Durchsuchbar sind die Artikel des Grünblogs – dem Onlinemagazin der Grünen.',
    meta: 'Magazin',
    tags: ['Grünblog', 'Magazin', 'Wissen', 'Meinen', 'Machen'],
    icon: PiNewspaper,
    order: 7,
    category: 'weitere',
  },
];

const DEV_ONLY_NOTEBOOKS: NotebookConfigEntry[] = [
  {
    id: 'bayern-notebook',
    path: '/notebooks/bayern',
    title: 'Bayern',
    description: 'Durchsuchbar ist das Regierungsprogramm der Grünen Bayern zur Landtagswahl.',
    meta: '1 Programm',
    tags: ['Bayern', 'Regierungsprogramm'],
    icon: PiMapPin,
    order: 6,
    category: 'landesebene',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-bayern',
  },
  {
    id: 'boell-stiftung-notebook',
    path: '/notebooks/boell-stiftung',
    title: 'Heinrich-Böll-Stiftung',
    description: 'Durchsuchbar sind Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung.',
    meta: 'Publikationen',
    tags: ['Analysen', 'Dossiers', 'Atlanten'],
    icon: PiLightbulb,
    order: 7,
    category: 'weitere',
  },
];

export const SYSTEM_NOTEBOOKS: NotebookConfigEntry[] = [
  ...PRODUCTION_NOTEBOOKS,
  ...(import.meta.env.DEV ? DEV_ONLY_NOTEBOOKS : []),
];

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
export const getNotebooksByDefaultAgent = (): ReadonlyMap<
  string,
  NotebookConfigEntry[]
> => {
  const map = new Map<string, NotebookConfigEntry[]>();
  for (const nb of SYSTEM_NOTEBOOKS) {
    if (!nb.defaultAgent) continue;
    const list = map.get(nb.defaultAgent) ?? [];
    list.push(nb);
    map.set(nb.defaultAgent, list);
  }
  return map;
};
