import {
  NOTEBOOK_REGISTRY,
  type NotebookCategory,
  type NotebookId,
} from '@gruenerator/shared/notebooks';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

export interface NotebookCollection {
  id: string;
  name: string;
  description: string;
  documentCount: string;
  linkType: 'vectorDocument' | 'url';
  externalUrl?: string;
  locale: 'de-DE' | 'de-AT';
}

export interface NotebookConfig {
  id: string;
  title: string;
  collectionType: 'single' | 'multi';
  collections: NotebookCollection[];
  placeholder: string;
  exampleQuestions: Array<{ icon: string; text: string }>;
  icon: 'library' | 'document-text' | 'globe' | 'flag';
  color: string;
}

export type { NotebookCategory };

export interface MobileNotebookEntry {
  id: string;
  title: string;
  description: string;
  meta: string;
  icon: IoniconsIconName;
  order: number;
  category: NotebookCategory;
}

/**
 * Mobile's only per-notebook maintenance: the Ionicons name for each notebook (RN can't
 * render the react-icons SVGs the web/chat side use). `satisfies Record<NotebookId, …>`
 * forces an icon for every notebook in the shared registry, so adding one there fails the
 * mobile build until an icon is supplied.
 */
const NOTEBOOK_IONICONS = {
  'gruenerator-notebook': 'search',
  'gruene-notebook': 'book',
  'bundestagsfraktion-notebook': 'business',
  'hamburg-notebook': 'compass',
  'schleswig-holstein-notebook': 'location',
  'thueringen-notebook': 'leaf',
  'berlin-notebook': 'business',
  'mecklenburg-vorpommern-notebook': 'flag',
  'brandenburg-notebook': 'leaf',
  'bayern-notebook': 'location',
  'sachsen-anhalt-notebook': 'leaf',
  'hessen-notebook': 'ribbon',
  'saarland-notebook': 'location',
  'oesterreich-notebook': 'globe',
  'kommunalwiki-notebook': 'scale',
  'gruenblog-notebook': 'newspaper',
  'abgeordnetenwatch-notebook': 'checkbox',
  'boell-stiftung-notebook': 'bulb',
} satisfies Record<NotebookId, IoniconsIconName>;

/**
 * Mobile gallery notebooks, derived from the shared registry. Excludes dev-only and
 * disabled (`enabled: false`) notebooks, then resolves the Ionicons name by id.
 */
export const MOBILE_SYSTEM_NOTEBOOKS: MobileNotebookEntry[] = NOTEBOOK_REGISTRY.filter(
  (nb) => !nb.devOnly && nb.enabled !== false
)
  .map((nb) => ({
    id: nb.id,
    title: nb.title,
    description: nb.description,
    meta: nb.meta,
    icon: NOTEBOOK_IONICONS[nb.id],
    order: nb.order,
    category: nb.category,
  }))
  .sort((a, b) => a.order - b.order);

export const HIDDEN_NOTEBOOK_IDS = ['gruenerator-notebook', 'gruenblog-notebook'];

/**
 * Maps each gallery notebook to the `*-system` collection id(s) the research backend
 * (`/research/search`, `/research/filters`) expects. The backend keeps the canonical
 * `notebook → collection` map (`apps/api/config/notebookCollectionMap.ts`) but in a
 * different id namespace (`bayern` vs `bayern-system`) and never ships it to the client,
 * so the notebook-detail Recherche needs this small client-side table to scope a search.
 *
 * `satisfies Record<NotebookId, …>` forces an entry for every notebook in the shared
 * registry — adding one there fails the mobile build until its research collection is
 * supplied, the same safety the `NOTEBOOK_IONICONS` map relies on.
 */
const NOTEBOOK_RESEARCH_COLLECTIONS = {
  'gruenerator-notebook': [
    'grundsatz-system',
    'bundestagsfraktion-system',
    'gruene-de-system',
    'kommunalwiki-system',
    'gruenblog-system',
  ],
  'gruene-notebook': ['grundsatz-system'],
  'bundestagsfraktion-notebook': ['bundestagsfraktion-system'],
  'hamburg-notebook': ['hamburg-system'],
  'schleswig-holstein-notebook': ['schleswig-holstein-system'],
  'thueringen-notebook': ['thueringen-system'],
  'berlin-notebook': ['berlin-system'],
  'mecklenburg-vorpommern-notebook': ['mecklenburg-vorpommern-system'],
  'brandenburg-notebook': ['brandenburg-system'],
  'bayern-notebook': ['bayern-system'],
  'sachsen-anhalt-notebook': ['sachsen-anhalt-system'],
  'hessen-notebook': ['hessen-system'],
  'saarland-notebook': ['saarland-system'],
  'oesterreich-notebook': ['oesterreich-gruene-system'],
  'kommunalwiki-notebook': ['kommunalwiki-system'],
  'gruenblog-notebook': ['gruenblog-system'],
  'abgeordnetenwatch-notebook': ['abgeordnetenwatch-system'],
  'boell-stiftung-notebook': ['boell-stiftung-system'],
} satisfies Record<NotebookId, string[]>;

/**
 * Research collection ids for a system notebook, or `[]` for user notebooks (UUIDs) which
 * scope research through the per-notebook contract endpoint instead.
 */
export const getResearchCollectionIds = (notebookId: string): string[] =>
  (NOTEBOOK_RESEARCH_COLLECTIONS as Record<string, string[]>)[notebookId] ?? [];

const audienceOf = (id: string): 'de-DE' | 'de-AT' | 'all' =>
  NOTEBOOK_REGISTRY.find((nb) => nb.id === id)?.audience ?? 'all';

const isVisibleForLocale = (nb: MobileNotebookEntry, locale: 'de-DE' | 'de-AT'): boolean => {
  const audience = audienceOf(nb.id);
  return audience === 'all' || audience === locale;
};

/** Gallery-visible notebooks for the user's locale (mirrors the web German/Austrian split). */
export const getVisibleNotebooks = (locale: 'de-DE' | 'de-AT'): MobileNotebookEntry[] =>
  MOBILE_SYSTEM_NOTEBOOKS.filter(
    (nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id) && isVisibleForLocale(nb, locale)
  );

export const getMobileNotebooksByCategory = (
  category: NotebookCategory,
  locale: 'de-DE' | 'de-AT'
): MobileNotebookEntry[] => getVisibleNotebooks(locale).filter((nb) => nb.category === category);

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export const NOTEBOOK_CONFIGS: Record<string, NotebookConfig> = {
  gruenerator: {
    id: 'gruenerator',
    title: 'Frag Grünerator',
    collectionType: 'multi',
    collections: [
      {
        id: 'grundsatz-system',
        name: 'Grundsatzprogramme',
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-DE',
      },
      {
        id: 'bundestagsfraktion-system',
        name: 'Bundestagsfraktion',
        description: 'Fachtexte, Ziele und einfache Erklärungen',
        documentCount: '542 Artikel',
        externalUrl: 'https://www.gruene-bundestag.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'gruene-de-system',
        name: 'gruene.de',
        description: 'Positionen, Themen und Aktuelles von gruene.de',
        documentCount: 'Webseite',
        externalUrl: 'https://www.gruene.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'oesterreich-gruene-system',
        name: 'Die Grünen Österreich',
        description: 'Programme der Grünen – Die Grüne Alternative Österreich',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-AT',
      },
      {
        id: 'gruene-at-system',
        name: 'gruene.at',
        description: 'Positionen, Themen und Aktuelles von gruene.at',
        documentCount: 'Webseite',
        externalUrl: 'https://www.gruene.at',
        linkType: 'url',
        locale: 'de-AT',
      },
      {
        id: 'kommunalwiki-system',
        name: 'KommunalWiki',
        description: 'Fachwissen zur Kommunalpolitik (Heinrich-Böll-Stiftung)',
        documentCount: 'Wiki',
        externalUrl: 'https://kommunalwiki.boell.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'bayern-system',
        name: 'Grüne Bayern',
        description: 'Regierungsprogramm zur Landtagswahl',
        documentCount: '1 Programm',
        externalUrl: 'https://www.gruene-bayern.de',
        linkType: 'url',
        locale: 'de-DE',
      },
      {
        id: 'boell-stiftung-system',
        name: 'Heinrich-Böll-Stiftung',
        description: 'Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung',
        documentCount: 'Publikationen',
        externalUrl: 'https://www.boell.de',
        linkType: 'url',
        locale: 'de-DE',
      },
    ],
    placeholder: 'Stell deine Frage zu grüner Politik...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was sagen die Grünen zum Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie ist die grüne Position zur EU?' },
      { icon: '⚡', text: 'Was steht zur Energiewende in den Programmen?' },
    ],
    icon: 'library',
    color: '#316049',
  },

  gruene: {
    id: 'gruene',
    title: 'Frag Bündnis 90/Die Grünen',
    collectionType: 'single',
    collections: [
      {
        id: 'grundsatz-system',
        name: 'Grundsatzprogramme',
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-DE',
      },
    ],
    placeholder: 'Stell deine Frage zu den Grundsatzprogrammen...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie positionieren sich die Grünen zur EU?' },
      { icon: '🏛️', text: 'Was sagt das Regierungsprogramm zu Bildung?' },
    ],
    icon: 'document-text',
    color: '#46962b',
  },

  bundestagsfraktion: {
    id: 'bundestagsfraktion',
    title: 'Frag die Bundestagsfraktion',
    collectionType: 'single',
    collections: [
      {
        id: 'bundestagsfraktion-system',
        name: 'Bundestagsfraktion',
        description: 'Fachtexte, Ziele und einfache Erklärungen',
        documentCount: '542 Artikel',
        externalUrl: 'https://www.gruene-bundestag.de',
        linkType: 'url',
        locale: 'de-DE',
      },
    ],
    placeholder: 'Stell deine Frage zur Grünen Bundestagsfraktion...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was sind die Klimaziele der Fraktion?' },
      { icon: '📋', text: 'Welche Positionen gibt es zur Migrationspolitik?' },
      { icon: '💶', text: 'Wie positioniert sich die Fraktion zum Haushalt?' },
    ],
    icon: 'globe',
    color: '#005538',
  },

  oesterreich: {
    id: 'oesterreich',
    title: 'Frag Die Grünen Österreich',
    collectionType: 'single',
    collections: [
      {
        id: 'oesterreich-gruene-system',
        name: 'Die Grünen Österreich',
        description: 'Programme der Grünen – Die Grüne Alternative Österreich',
        documentCount: '3 Programme',
        linkType: 'vectorDocument',
        locale: 'de-AT',
      },
    ],
    placeholder: 'Stell deine Frage zu den Programmen der Grünen Österreich...',
    exampleQuestions: [
      { icon: '🌍', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
      { icon: '🇪🇺', text: 'Wie positionieren sich Die Grünen Österreich zur EU?' },
      { icon: '🏛️', text: 'Was sagt das Wahlprogramm zur Nationalratswahl?' },
    ],
    icon: 'flag',
    color: '#88b626',
  },
};

export const NOTEBOOK_LIST = Object.values(NOTEBOOK_CONFIGS);

export const getNotebookConfig = (configId: string): NotebookConfig => {
  return NOTEBOOK_CONFIGS[configId] || NOTEBOOK_CONFIGS.gruenerator;
};

/**
 * Resolve the per-notebook chat config (placeholder + example questions) from a
 * canonical notebook id (e.g. `gruenerator-notebook` → the `gruenerator` config).
 * Returns `null` when no config exists (most Landesverband notebooks), so callers
 * can fall back to generic copy instead of mislabelling with the gruenerator default.
 */
export const getNotebookConfigByNotebookId = (notebookId: string): NotebookConfig | null => {
  const configId = notebookId.replace(/-notebook$/, '');
  return NOTEBOOK_CONFIGS[configId] ?? null;
};
