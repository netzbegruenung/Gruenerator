/**
 * Single source of truth for the **system notebook list** shared across platforms.
 *
 * Adding a notebook used to mean editing four parallel hardcoded lists (web gallery,
 * mobile gallery, chat `notebookMentionables`, and the icon map) which inevitably drifted
 * — e.g. Bayern shipped on web + chat but was silently missing from the mobile gallery.
 * This registry is the one place a notebook is defined; web/mobile galleries and the chat
 * mention picker all derive from it.
 *
 * **Pure data — no `react-icons`, no `react-native`.** Icons can't live here: web/chat use
 * `react-icons` component types, mobile uses Ionicons string names, and RN can't render
 * react-icons' SVGs. Instead, the notebook `id` is the shared key and each platform keeps a
 * `Record<NotebookId, …>` icon map (`@gruenerator/shared/notebook-icons` for web/chat, a
 * local Ionicons map on mobile). Because `Record<Union, T>` requires every key, adding a
 * `NotebookId` here forces a compile error on any platform whose icon map is missing it.
 *
 * Exposed via the dedicated `@gruenerator/shared/notebooks` subpath so it stays free of
 * UI-framework imports and is safe for backend, mobile, and web alike.
 */

export type NotebookCategory = 'bundesebene' | 'landesebene' | 'weitere' | 'oesterreich';

export type NotebookAudience = 'de-DE' | 'de-AT' | 'all';

/**
 * Hand-written union (not `as const` inference) so it can both `satisfies`-check the
 * registry array AND drive `Record<NotebookId, …>` exhaustiveness on each platform's icon
 * map. Renaming/adding a notebook here is the single edit that ripples out as type errors.
 */
export type NotebookId =
  | 'gruenerator-notebook'
  | 'gruene-notebook'
  | 'bundestagsfraktion-notebook'
  | 'hamburg-notebook'
  | 'schleswig-holstein-notebook'
  | 'thueringen-notebook'
  | 'berlin-notebook'
  | 'mecklenburg-vorpommern-notebook'
  | 'brandenburg-notebook'
  | 'bayern-notebook'
  | 'sachsen-anhalt-notebook'
  | 'hessen-notebook'
  | 'oesterreich-notebook'
  | 'kommunalwiki-notebook'
  | 'gruenblog-notebook'
  | 'boell-stiftung-notebook';

export interface NotebookDefinition {
  id: NotebookId;
  /** Gallery title, e.g. "Hamburg". */
  title: string;
  /** Gallery long description. */
  description: string;
  /** Short gallery badge, e.g. "Archiv", "3 Programme". */
  meta: string;
  tags: string[];
  order: number;
  category: NotebookCategory;
  /** Locale visibility. CLAUDE.md mandate: tag explicitly. */
  audience: NotebookAudience;
  /**
   * When false, hidden from gallery listings but still routable / mention-able so links
   * mid-session don't 404. The backend `notebookCollectionMap.DISABLED_NOTEBOOK_IDS`
   * should match. Defaults to true when omitted.
   */
  enabled?: boolean;
  /** Gated to dev builds only (web `import.meta.env.DEV`; excluded from mobile gallery). */
  devOnly?: boolean;
  /**
   * Agent identifier to pre-select when entering this notebook. Typed as `string` here to
   * keep the registry framework-agnostic; web casts to `SystemAgentId` so renames there
   * still fail at compile time.
   */
  defaultAgent?: string;
  /** Chat @-mention picker metadata (copy intentionally differs from the gallery). */
  mention: {
    /** Alias typed after `@`, e.g. 'hamburg', 'at', 'alle'. */
    alias: string;
    /** Mention title, e.g. "Grüne Hamburg". */
    title: string;
    /** Short mention description. */
    description: string;
    /** Emoji fallback avatar. */
    avatar: string;
    backgroundColor: string;
  };
}

/**
 * The canonical notebook list — a reconciled superset of the previously separate web,
 * mobile, and chat-mention lists. Entries are listed grouped by category for readability;
 * the `order` field (not array position) drives sort order in the galleries.
 */
export const NOTEBOOK_REGISTRY = [
  {
    id: 'gruenerator-notebook',
    title: 'Grünerator',
    description: 'Durchsucht automatisch mehrere Quellen parallel und kombiniert die Ergebnisse.',
    meta: 'Mehrere Quellen',
    tags: ['Multi-Suche', 'Empfohlen'],
    order: 0,
    category: 'bundesebene',
    audience: 'all',
    mention: {
      alias: 'alle',
      title: 'Alle Quellen',
      description: 'Durchsucht mehrere Quellen parallel',
      avatar: '🔍',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'gruene-notebook',
    title: 'Bundesverband',
    description: 'Durchsuchbar sind die offiziellen Grundsatzprogramme von Bündnis 90/Die Grünen.',
    meta: '3 Programme',
    tags: ['Grundsatzprogramm', 'EU-Wahl', 'Regierung'],
    order: 1,
    category: 'bundesebene',
    audience: 'de-DE',
    mention: {
      alias: 'grundsatz',
      title: 'Grundsatzprogramm',
      description: 'Grundsatzprogramme von Bündnis 90/Die Grünen',
      avatar: '📗',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'bundestagsfraktion-notebook',
    title: 'Bundestagsfraktion',
    description:
      'Durchsuchbar sind die offiziellen Inhalte von gruene-bundestag.de – Fachtexte, politische Ziele und einfache Erklärungen.',
    meta: '542 Artikel',
    tags: ['Fachtexte', 'Ziele', 'Einfach erklärt'],
    order: 2,
    category: 'bundesebene',
    audience: 'de-DE',
    mention: {
      alias: 'bundestag',
      title: 'Bundestagsfraktion',
      description: 'Inhalte von gruene-bundestag.de',
      avatar: '🏛️',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'oesterreich-notebook',
    title: 'Die Grünen Österreich',
    description:
      'Durchsuchbar sind die offiziellen Programme von Die Grünen – Die Grüne Alternative Österreich.',
    meta: '3 Programme',
    tags: ['Österreich', 'Grundsatzprogramm', 'Nationalrat'],
    order: 3,
    category: 'oesterreich',
    audience: 'de-AT',
    mention: {
      alias: 'at',
      title: 'Grüne Österreich',
      description: 'Programme von Die Grünen Österreich',
      avatar: '🇦🇹',
      backgroundColor: '#88B04B',
    },
  },
  {
    id: 'hamburg-notebook',
    title: 'Hamburg',
    description: 'Durchsuchbar sind Beschlüsse und Pressemitteilungen der Grünen Hamburg.',
    meta: 'Archiv',
    tags: ['Test', 'Hamburg', 'Beschlüsse', 'Presse'],
    order: 4,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-hamburg',
    mention: {
      alias: 'hamburg',
      title: 'Grüne Hamburg',
      description: 'Beschlüsse und Presse der Grünen Hamburg',
      avatar: '⚓',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'schleswig-holstein-notebook',
    title: 'Schleswig-Holstein',
    description:
      'Durchsuchbar ist das Wahlprogramm der Grünen Schleswig-Holstein zur Landtagswahl.',
    meta: '1 Programm',
    tags: ['Test', 'Schleswig-Holstein', 'Wahlprogramm'],
    order: 5,
    category: 'landesebene',
    audience: 'de-DE',
    enabled: false,
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-schleswig-holstein',
    mention: {
      alias: 'sh',
      title: 'Grüne Schleswig-Holstein',
      description: 'Wahlprogramm Schleswig-Holstein',
      avatar: '🌊',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'thueringen-notebook',
    title: 'Thüringen',
    description:
      'Durchsuchbar sind Beschlüsse, Wahlprogramme und Pressemitteilungen der Grünen Thüringen.',
    meta: 'Archiv',
    tags: ['Offiziell', 'Thüringen', 'Beschlüsse', 'Wahlprogramme', 'Presse'],
    order: 6,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-thueringen',
    mention: {
      alias: 'thüringen',
      title: 'Grüne Thüringen',
      description: 'Beschlüsse und Wahlprogramme Thüringen',
      avatar: '🏔️',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'berlin-notebook',
    title: 'Berlin',
    description:
      'Durchsuchbar sind Wahlprogramm 2026, Pressemitteilungen und Beschlüsse der Grünen Berlin.',
    meta: 'Archiv',
    tags: ['Berlin', 'Wahlprogramm', 'Beschlüsse', 'Presse'],
    order: 7,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-berlin',
    mention: {
      alias: 'berlin',
      title: 'Grüne Berlin',
      description: 'Wahlprogramm 2026, Pressemitteilungen und Beschlüsse Berlin',
      avatar: '🐻',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'mecklenburg-vorpommern-notebook',
    title: 'Mecklenburg-Vorpommern',
    description:
      'Durchsuchbar sind Pressemitteilungen und Parteitagsbeschlüsse der Grünen Mecklenburg-Vorpommern.',
    meta: 'Archiv',
    tags: ['Mecklenburg-Vorpommern', 'Beschlüsse', 'Presse'],
    order: 8,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern',
    mention: {
      alias: 'mv',
      title: 'Grüne Mecklenburg-Vorpommern',
      description: 'Presse und Parteitagsbeschlüsse MV',
      avatar: '🦅',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'brandenburg-notebook',
    title: 'Brandenburg',
    description:
      'Durchsuchbar sind Pressemitteilungen, Beschlüsse und das Landtagswahlprogramm 2024 der Brandenburger Bündnisgrünen.',
    meta: 'Archiv',
    tags: ['Brandenburg', 'Beschlüsse', 'Presse', 'Wahlprogramm'],
    order: 9,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-brandenburg',
    mention: {
      alias: 'brandenburg',
      title: 'Grüne Brandenburg',
      description: 'Presse, Beschlüsse und Landtagswahlprogramm 2024 Brandenburg',
      avatar: '🦅',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'bayern-notebook',
    title: 'Bayern',
    description:
      'Durchsuchbar sind Pressemitteilungen, Beschlüsse und das Regierungsprogramm der Grünen Bayern.',
    meta: 'Archiv',
    tags: ['Bayern', 'Presse', 'Beschlüsse', 'Regierungsprogramm'],
    order: 10,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-bayern',
    mention: {
      alias: 'bayern',
      title: 'Grüne Bayern',
      description: 'Pressemitteilungen, Beschlüsse und Regierungsprogramm Bayern',
      avatar: '🦁',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'sachsen-anhalt-notebook',
    title: 'Sachsen-Anhalt',
    description:
      'Durchsuchbar sind Pressemitteilungen, Beschlüsse und das Landtagswahlprogramm 2026 der Grünen Sachsen-Anhalt.',
    meta: 'Archiv',
    tags: ['Sachsen-Anhalt', 'Presse', 'Beschlüsse', 'Wahlprogramm'],
    order: 11,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-sachsen-anhalt',
    mention: {
      alias: 'sachsen-anhalt',
      title: 'Grüne Sachsen-Anhalt',
      description: 'Presse, Beschlüsse und Landtagswahlprogramm 2026 Sachsen-Anhalt',
      avatar: '🌾',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'hessen-notebook',
    title: 'Hessen',
    description:
      'Durchsuchbar sind Pressemitteilungen und Beschlüsse der Grünen Hessen (Landesverband & Fraktion).',
    meta: 'Archiv',
    tags: ['Hessen', 'Presse', 'Beschlüsse'],
    order: 12,
    category: 'landesebene',
    audience: 'de-DE',
    defaultAgent: 'gruenerator-oeffentlichkeitsarbeit-hessen',
    mention: {
      alias: 'hessen',
      title: 'Grüne Hessen',
      description: 'Presse und Beschlüsse Hessen',
      avatar: '🦁',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'kommunalwiki-notebook',
    title: 'KommunalWiki',
    description:
      'Fachwissen zur Kommunalpolitik – durchsuchbar über das KommunalWiki der Heinrich-Böll-Stiftung.',
    meta: 'Wiki',
    tags: ['Kommunalpolitik', 'Böll-Stiftung'],
    order: 6,
    category: 'weitere',
    audience: 'de-DE',
    mention: {
      alias: 'kommunalwiki',
      title: 'KommunalWiki',
      description: 'Fachwissen zur Kommunalpolitik',
      avatar: '📚',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'gruenblog-notebook',
    title: 'Grünblog',
    description: 'Durchsuchbar sind die Artikel des Grünblogs – dem Onlinemagazin der Grünen.',
    meta: 'Magazin',
    tags: ['Grünblog', 'Magazin', 'Wissen', 'Meinen', 'Machen'],
    order: 7,
    category: 'weitere',
    audience: 'de-DE',
    mention: {
      alias: 'gruenblog',
      title: 'Grünblog',
      description: 'Onlinemagazin der Grünen',
      avatar: '📰',
      backgroundColor: '#316049',
    },
  },
  {
    id: 'boell-stiftung-notebook',
    title: 'Heinrich-Böll-Stiftung',
    description: 'Durchsuchbar sind Analysen, Dossiers und Atlanten der Heinrich-Böll-Stiftung.',
    meta: 'Publikationen',
    tags: ['Analysen', 'Dossiers', 'Atlanten'],
    order: 7,
    category: 'weitere',
    audience: 'de-DE',
    devOnly: true,
    mention: {
      alias: 'böll',
      title: 'Heinrich-Böll-Stiftung',
      description: 'Analysen und Dossiers der Böll-Stiftung',
      avatar: '📖',
      backgroundColor: '#316049',
    },
  },
] satisfies readonly NotebookDefinition[];

const isEnabled = (nb: NotebookDefinition): boolean => nb.enabled !== false;

export const getNotebookDefinition = (id: string): NotebookDefinition | undefined =>
  NOTEBOOK_REGISTRY.find((nb) => nb.id === id);

/**
 * Enabled notebooks, sorted by `order`. `devOnly` notebooks are excluded unless
 * `includeDevOnly` is set (web passes `import.meta.env.DEV`).
 */
export const getOrderedNotebooks = (
  opts: { includeDevOnly?: boolean } = {}
): NotebookDefinition[] =>
  NOTEBOOK_REGISTRY.filter((nb) => isEnabled(nb) && (opts.includeDevOnly || !nb.devOnly)).sort(
    (a, b) => a.order - b.order
  );

/**
 * Notebooks visible to a given locale: those tagged for that locale plus `audience: 'all'`.
 * Mirrors the web gallery's German/Austrian split so mobile can apply the same filtering.
 */
export const getNotebooksForAudience = (
  locale: 'de-DE' | 'de-AT',
  opts: { includeDevOnly?: boolean } = {}
): NotebookDefinition[] =>
  getOrderedNotebooks(opts).filter((nb) => nb.audience === 'all' || nb.audience === locale);

export const getNotebooksByCategory = (
  category: NotebookCategory,
  opts: { includeDevOnly?: boolean } = {}
): NotebookDefinition[] => getOrderedNotebooks(opts).filter((nb) => nb.category === category);
