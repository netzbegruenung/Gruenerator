/**
 * Single source of truth for the app's tool identity: which tools exist, their
 * canonical id/title/route/icon, and which surfaces each serves (Arbeiten tile,
 * /office create strip, "Weitere" menu, global-search catalog, sidebar
 * favourites, colour theme). A rename starts HERE.
 *
 * Derived views:
 *   - sidebarFavouritesConfig.ts, toolTheme.ts (key union) and
 *     sidebarFavouritesStore.ts (legacy aliases) derive from this file at
 *     runtime / at the type level.
 *   - workplaceToolsConfig.ts and toolCatalog.ts are LITERAL MIRRORS: the docs
 *     generators (documentation/scripts/generate-ui-labels.mjs and
 *     generate-tool-catalog.mjs) AST-parse those files and require plain array
 *     literals, so their values cannot be computed from here. Each mirror is
 *     locked to the registry twice: `satisfies` pins every literal id to a
 *     registry id at compile time, and toolRegistry.vitest.ts asserts the
 *     mirrors deep-equal the derived arrays below. After a registry edit, the
 *     typecheck/tests point at every mirror literal still carrying old values.
 */
import { RiSpyLine } from 'react-icons/ri';

import { getIcon, type ActionIconName, type IconType, type NavigationIconName } from './icons';

/** Icon reference resolved through config/icons.ts; `component` is the escape
 * hatch for icons without a registry entry (Agentura's RiSpyLine). */
export type ToolIconRef =
  { navigation: NavigationIconName } | { actions: ActionIconName } | { component: IconType };

/** What an office-suite tile does when clicked: create a blank resource, or open
 * the template gallery. */
export type OfficeCreateKind = 'doc' | 'board' | 'sheet' | 'pres' | 'gallery';

/** Which tile strip a tool's colored tile lives in: the Arbeiten tab's
 * area/organise rows or the /studio landing strip. */
export type WorkplaceTileGroup = 'bereiche' | 'organisieren' | 'studio';

export interface ToolDefinition {
  id: string;
  title: string;
  /** Internal route. Mutually exclusive with `href`. */
  path?: string;
  /** External URL (opened in a new tab). Mutually exclusive with `path`. */
  href?: string;
  icon: ToolIconRef;
  /** Colored tile on the Arbeiten tab or the /studio landing page. */
  tile?: { group: WorkplaceTileGroup; description: string };
  /** Row inside the "Weitere" dropdown tile (the single menu, `menuRoot` below). */
  menuItem?: { description: string };
  /** The "Weitere" dropdown tile itself. */
  menuRoot?: { description: string };
  /** Global-search catalog entry. */
  search?: {
    /** Catalog id when it differs from the tool id (historic `tool-*` prefix). */
    id?: string;
    /** Title override when the search entry is worded differently. */
    title?: string;
    subtitle: string;
    keywords: readonly string[];
    /** Icon override when the catalog shows a different icon than the tile. */
    icon?: ToolIconRef;
    devOnly?: true;
  };
  /** Default sidebar-favourites entry, optionally retitled for the sidebar. */
  favourite?: true | { title: string };
  /** Has an entry in TOOL_THEME under its own id. */
  theme?: true;
}

// Within each surface, order follows this array (favourites, tile strips, menu
// rows all read top to bottom). Only the search catalog needs its own order
// (SEARCH_ORDER below) because it contradicts the studio tile order.
const TOOLS = [
  {
    id: 'office',
    title: 'Office',
    path: '/office',
    icon: { navigation: 'desk' },
    tile: { group: 'bereiche', description: 'Dokumente, Boards, Tabellen & Slides' },
    // Deliberately a bare search id (not tool-office): it mirrors the
    // favourites entry so featureIndex dedupes the two. The former per-type
    // entries (docs, boards, sheets, presentations) are gone — their paths were
    // mere redirects to /office, so a hit sent the user through a visible
    // detour. Their synonyms live on here so "excel" or "kanban" still finds
    // Office.
    search: {
      subtitle: 'Dokumente, Boards, Tabellen & Präsentationen',
      keywords: [
        'office',
        'docs',
        'dokumente',
        'dokument',
        'text',
        'schreiben',
        'brief',
        'antrag',
        'boards',
        'board',
        'kanban',
        'planen',
        'aufgaben',
        'todo',
        'whiteboard',
        'tabellen',
        'tabelle',
        'sheet',
        'excel',
        'kalkulation',
        'budget',
        'daten',
        'praesentationen',
        'praesentation',
        'praesi',
        'folien',
        'slides',
        'vortrag',
        'pitch',
        'deck',
      ],
    },
    favourite: true,
    theme: true,
  },
  {
    id: 'canvas',
    title: 'Studio',
    path: '/studio',
    icon: { navigation: 'sharepic' },
    tile: { group: 'bereiche', description: 'KI-Bilder, Sharepics & Reels' },
    search: {
      id: 'tool-studio',
      subtitle: 'Sharepics, KI-Bilder & Videos',
      keywords: ['studio', 'sharepic', 'bild', 'grafik', 'design', 'poster', 'kachel'],
    },
    favourite: { title: 'Bilder & Videos' },
    theme: true,
  },
  {
    id: 'wissen',
    title: 'Wissen',
    path: '/wissen',
    icon: { navigation: 'notebooks' },
    tile: { group: 'bereiche', description: 'Recherche & Notebooks' },
    favourite: true,
    theme: true,
  },
  {
    id: 'agents',
    title: 'Agentura',
    path: '/agentura',
    icon: { component: RiSpyLine },
    tile: { group: 'organisieren', description: 'Grüneratoren & Rezepte' },
    search: {
      id: 'tool-agentura',
      subtitle: 'KI-Grüneratoren & Rezepte entdecken',
      icon: { navigation: 'desk' },
      keywords: ['agentura', 'agent', 'agenten', 'grünerator', 'grueneratoren', 'skills', 'ki'],
    },
    theme: true,
  },
  {
    id: 'projekte',
    title: 'Projekte',
    path: '/projekte',
    icon: { navigation: 'projekte' },
    tile: { group: 'organisieren', description: 'Chats & Inhalte bündeln' },
    search: {
      id: 'tool-projekte',
      subtitle: 'Chats & Inhalte bündeln, Zusammenarbeit im Team',
      keywords: [
        'projekte',
        'projekt',
        'spaces',
        'space',
        'gruppen',
        'gruppe',
        'team',
        'organisation',
        'zusammenarbeit',
      ],
    },
    favourite: true,
    theme: true,
  },
  {
    id: 'suche',
    title: 'Suche',
    path: '/suche',
    icon: { navigation: 'suche' },
    search: {
      id: 'tool-suche',
      title: 'Websuche',
      subtitle: 'Recherche im Netz',
      keywords: ['suche', 'websuche', 'recherche', 'search', 'internet'],
    },
    favourite: true,
  },
  {
    id: 'weitere',
    title: 'Weitere',
    icon: { navigation: 'tools' },
    menuRoot: { description: 'Mehr Werkzeuge' },
    theme: true,
  },
  {
    id: 'scanner',
    title: 'Scanner',
    path: '/scanner',
    icon: { navigation: 'scanner' },
    menuItem: { description: 'Fotos & Scans zu Text' },
    search: {
      id: 'tool-scanner',
      subtitle: 'Fotos & Scans in Text umwandeln',
      keywords: ['scanner', 'scan', 'ocr', 'text', 'digitalisieren', 'foto', 'dokument'],
    },
    favourite: true,
  },
  {
    id: 'zeichenzaehler',
    title: 'Zeichenzähler',
    path: '/zeichenzaehler',
    icon: { navigation: 'zeichenzaehler' },
    menuItem: { description: 'Wörter zählen' },
    search: {
      id: 'tool-zeichenzaehler',
      subtitle: 'Zeichen, Wörter & Social-Limits zählen',
      keywords: ['zeichenzaehler', 'zeichen', 'woerter', 'counter', 'limit', 'laenge'],
    },
  },
  {
    id: 'transkription',
    title: 'Transkription',
    path: '/transkription',
    icon: { navigation: 'transkription' },
    menuItem: { description: 'Audio zu Text' },
    search: {
      id: 'tool-transkription',
      subtitle: 'Audio mit KI verschriftlichen',
      keywords: [
        'transkription',
        'transkript',
        'audio',
        'meeting',
        'interview',
        'whisper',
        'sprache',
      ],
    },
    favourite: true,
  },
  {
    id: 'newsletter',
    title: 'Newsletter',
    href: 'https://896ca129.sibforms.com/serve/MUIFAFnH3lov98jrw3d75u_DFByChA39XRS6JkBKqjTsN9gx0MxCvDn1FMnkvHLgzxEh1JBcEOiyHEkyzRC-XUO2DffKsVccZ4r7CCaYiugoiLf1a-yoTxDwoctxuzCsmDuodwrVwEwnofr7K42jQc-saIKeVuB_8UxrwS18QIaahZml1qMExNno2sEC7HyMy9Nz4f2f8-UJ4QmW',
    icon: { navigation: 'presse-social' },
    menuItem: { description: 'Updates abonnieren' },
  },
  {
    id: 'mcp',
    title: 'MCP',
    path: '/apps',
    icon: { actions: 'link' },
    menuItem: { description: 'ChatGPT & Co verbinden' },
  },
  {
    id: 'canvas-vorlagen',
    title: 'Vorlagen',
    path: '/vorlagen',
    icon: { navigation: 'vorlagen' },
    tile: { group: 'studio', description: 'Design-Vorlagen' },
    search: {
      id: 'tool-vorlagen',
      subtitle: 'Fertige Design-Vorlagen',
      keywords: ['vorlagen', 'vorlage', 'template', 'design'],
    },
    theme: true,
  },
  {
    id: 'canvas-ki',
    title: 'KI-Bilder',
    path: '/bild-editor',
    icon: { navigation: 'imagine' },
    tile: { group: 'studio', description: 'Erstellen & bearbeiten' },
    search: {
      id: 'tool-imagine',
      title: 'KI-Bild erstellen',
      subtitle: 'Bilder mit KI erstellen & bearbeiten',
      keywords: [
        'imagine',
        'ki-bild',
        'bild',
        'image',
        'foto',
        'generieren',
        'flux',
        'ai',
        'editor',
      ],
    },
    theme: true,
  },
  {
    id: 'canvas-sharepics',
    title: 'Sharepics',
    path: '/studio/templates',
    icon: { navigation: 'sharepic' },
    tile: { group: 'studio', description: 'Grafiken gestalten' },
    theme: true,
  },
  {
    id: 'reels-untertitel',
    title: 'Reels',
    path: '/studio/video',
    icon: { navigation: 'reel' },
    tile: { group: 'studio', description: 'Untertitel für Clips' },
    search: {
      id: 'tool-reel',
      title: 'Reel',
      subtitle: 'Social-Clips untertiteln',
      keywords: ['reel', 'video', 'untertitel', 'subtitle', 'clip', 'social', 'tiktok', 'story'],
    },
    theme: true,
  },
  {
    id: 'tool-notebooks',
    title: 'Notebooks',
    path: '/notebooks',
    icon: { navigation: 'notebooks' },
    search: {
      subtitle: 'Wissensmanagement & Recherche',
      keywords: ['notebooks', 'notebook', 'wissen', 'recherche', 'dokumente'],
    },
  },
  {
    id: 'tool-chat',
    title: 'Chat',
    path: '/chat',
    icon: { navigation: 'messenger' },
    search: {
      subtitle: 'KI-Assistent',
      keywords: ['chat', 'assistent', 'ki', 'gpt', 'frage'],
    },
  },
  {
    id: 'tool-transfer',
    title: 'Transfer',
    path: '/transfer',
    icon: { actions: 'upload' },
    search: {
      subtitle: 'Dateien sicher übertragen',
      keywords: ['transfer', 'datei', 'upload', 'senden', 'teilen'],
      devOnly: true,
    },
  },
] as const satisfies readonly ToolDefinition[];

export { TOOLS };

export type ToolId = (typeof TOOLS)[number]['id'];

export interface OfficeSuiteActionDefinition {
  id: string;
  title: string;
  description: string;
  icon: ToolIconRef;
  create: OfficeCreateKind;
}

// The /office create tiles are actions, not navigable tools (no route of their
// own), so they live outside TOOLS — which also keeps their ids ('docs',
// 'boards', …) from colliding with ToolId while the same strings serve as
// legacy favourite aliases below. "Vorlagen" opens the template gallery; the
// rest create an empty resource and open its editor (see DocsPage's
// officeToolStrip). The id doubles as the TOOL_THEME key.
const OFFICE_SUITE_ACTIONS = [
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Aus Vorlage starten',
    icon: { navigation: 'vorlagen' },
    create: 'gallery',
  },
  {
    id: 'docs',
    title: 'Leeres Dokument',
    description: 'Leeres Textdokument',
    icon: { navigation: 'docs' },
    create: 'doc',
  },
  {
    id: 'boards',
    title: 'Leeres Board',
    description: 'Leeres Kanban-Board',
    icon: { navigation: 'boards' },
    create: 'board',
  },
  {
    id: 'sheets',
    title: 'Leere Tabelle',
    description: 'Leere Kalkulationstabelle',
    icon: { navigation: 'sheets' },
    create: 'sheet',
  },
  {
    id: 'presentations',
    title: 'Leere Präsentation',
    description: 'Leere Foliensammlung',
    icon: { navigation: 'presentations' },
    create: 'pres',
  },
] as const satisfies readonly OfficeSuiteActionDefinition[];

export type OfficeSuiteActionId = (typeof OFFICE_SUITE_ACTIONS)[number]['id'];

type ThemedToolId = Extract<(typeof TOOLS)[number], { theme: true }>['id'];

/** Every key TOOL_THEME must define: themed tools plus the office create tiles. */
export type ToolThemeId = ThemedToolId | OfficeSuiteActionId;

type SearchIdOf<T> = T extends { search: { id: infer I extends string } }
  ? I
  : T extends { search: object; id: infer I extends string }
    ? I
    : never;

/** The ids the global-search catalog uses (`search.id` override or the tool id). */
export type ToolSearchId = SearchIdOf<(typeof TOOLS)[number]>;

// Einziger Ort für Alt-IDs. Pinned ids survive tool renames in localStorage:
// the favourites store canonicalizes them onto current ids on rehydrate
// (office unification; Gruppen → Spaces → Projekte), and
// LEGACY_FAVOURITE_ITEMS keeps not-yet-migrated pins resolving in the sidebar.
export const LEGACY_TOOL_ID_ALIASES: Record<string, ToolId> = {
  docs: 'office',
  boards: 'office',
  sheets: 'office',
  presentations: 'office',
  notebooks: 'wissen',
  gruppen: 'projekte',
  spaces: 'projekte',
};

// Legacy ids kept ONLY so already-pinned favourites still resolve — they are
// part of the sidebar resolution map but never of the visible default set, so
// the global search never surfaces them (their paths are mere redirects to
// /office respectively /wissen). Includes the former ids of the /projekte tool
// (Gruppen → Spaces → Projekte renames).
const LEGACY_FAVOURITE_ITEMS: readonly {
  id: string;
  title: string;
  path: string;
  icon: ToolIconRef;
}[] = [
  { id: 'docs', title: 'Dokumente', path: '/docs', icon: { navigation: 'docs' } },
  { id: 'boards', title: 'Boards', path: '/boards', icon: { navigation: 'boards' } },
  { id: 'sheets', title: 'Tabellen', path: '/sheets', icon: { navigation: 'sheets' } },
  {
    id: 'presentations',
    title: 'Präsentationen',
    path: '/presentations',
    icon: { navigation: 'presentations' },
  },
  { id: 'notebooks', title: 'Wissen', path: '/wissen', icon: { navigation: 'notebooks' } },
  { id: 'gruppen', title: 'Projekte', path: '/projekte', icon: { navigation: 'projekte' } },
  { id: 'spaces', title: 'Projekte', path: '/projekte', icon: { navigation: 'projekte' } },
];

// Curated search-catalog order. Deliberately its own list: the catalog wants
// tool-reel/tool-studio first and tool-imagine before tool-vorlagen, which
// contradicts the studio tile order — no single TOOLS ordering can serve both.
const SEARCH_ORDER = [
  'tool-reel',
  'tool-studio',
  'tool-imagine',
  'tool-scanner',
  'tool-transkription',
  'tool-zeichenzaehler',
  'tool-vorlagen',
  'office',
  'tool-notebooks',
  'tool-chat',
  'tool-suche',
  'tool-agentura',
  'tool-projekte',
  'tool-transfer',
] as const satisfies readonly ToolSearchId[];

export function resolveToolIcon(ref: ToolIconRef): IconType {
  if ('component' in ref) return ref.component;
  if ('navigation' in ref) return getIcon('navigation', ref.navigation)!;
  return getIcon('actions', ref.actions)!;
}

// Widened view for the derivations below: iterating the as-const union directly
// would reject access to surface blocks that not every member declares.
const ALL_TOOLS: readonly ToolDefinition[] = TOOLS;

export interface DerivedTile {
  id: string;
  title: string;
  description: string;
  path?: string;
  href?: string;
  icon: IconType;
}

export function toolsWithTile(group: WorkplaceTileGroup): DerivedTile[] {
  const out: DerivedTile[] = [];
  for (const tool of ALL_TOOLS) {
    if (!tool.tile || tool.tile.group !== group) continue;
    out.push({
      id: tool.id,
      title: tool.title,
      description: tool.tile.description,
      ...(tool.path != null ? { path: tool.path } : {}),
      ...(tool.href != null ? { href: tool.href } : {}),
      icon: resolveToolIcon(tool.icon),
    });
  }
  return out;
}

export interface DerivedOfficeSuiteTool {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  create: OfficeCreateKind;
}

export function officeSuiteTools(): DerivedOfficeSuiteTool[] {
  return OFFICE_SUITE_ACTIONS.map((action) => ({
    id: action.id,
    title: action.title,
    description: action.description,
    icon: resolveToolIcon(action.icon),
    create: action.create,
  }));
}

export interface DerivedToolMenu {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  items: DerivedTile[];
}

// There is a single menu today, so every `menuItem` tool belongs to the one
// `menuRoot` tool ("Weitere").
export function toolMenus(): DerivedToolMenu[] {
  const items: DerivedTile[] = [];
  for (const tool of ALL_TOOLS) {
    if (!tool.menuItem) continue;
    items.push({
      id: tool.id,
      title: tool.title,
      description: tool.menuItem.description,
      ...(tool.path != null ? { path: tool.path } : {}),
      ...(tool.href != null ? { href: tool.href } : {}),
      icon: resolveToolIcon(tool.icon),
    });
  }
  const menus: DerivedToolMenu[] = [];
  for (const tool of ALL_TOOLS) {
    if (!tool.menuRoot) continue;
    menus.push({
      id: tool.id,
      title: tool.title,
      description: tool.menuRoot.description,
      icon: resolveToolIcon(tool.icon),
      items,
    });
  }
  return menus;
}

export interface DerivedCatalogEntry {
  id: string;
  title: string;
  subtitle: string;
  path: string;
  icon: IconType | null;
  keywords: string[];
  devOnly?: boolean;
}

export function toolSearchCatalog(): DerivedCatalogEntry[] {
  const bySearchId = new Map<string, ToolDefinition>();
  for (const tool of ALL_TOOLS) {
    if (tool.search) bySearchId.set(tool.search.id ?? tool.id, tool);
  }
  return SEARCH_ORDER.map((searchId) => {
    const tool = bySearchId.get(searchId);
    if (!tool?.search || tool.path == null) {
      throw new Error(`SEARCH_ORDER entry without matching searchable tool: ${searchId}`);
    }
    return {
      id: searchId,
      title: tool.search.title ?? tool.title,
      subtitle: tool.search.subtitle,
      path: tool.path,
      icon: resolveToolIcon(tool.search.icon ?? tool.icon),
      keywords: [...tool.search.keywords],
      ...(tool.search.devOnly ? { devOnly: true } : {}),
    };
  });
}

export interface DerivedFavouriteItem {
  id: string;
  title: string;
  path: string;
  icon: IconType;
}

export function favouriteToolItems(): DerivedFavouriteItem[] {
  const out: DerivedFavouriteItem[] = [];
  for (const tool of ALL_TOOLS) {
    if (!tool.favourite || tool.path == null) continue;
    out.push({
      id: tool.id,
      title: typeof tool.favourite === 'object' ? tool.favourite.title : tool.title,
      path: tool.path,
      icon: resolveToolIcon(tool.icon),
    });
  }
  return out;
}

export function legacyFavouriteItems(): DerivedFavouriteItem[] {
  return LEGACY_FAVOURITE_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    path: item.path,
    icon: resolveToolIcon(item.icon),
  }));
}

/** Grid tiles pinnable via their star: Arbeiten row first, then the /studio
 * strip — mirroring the old `[...WORKPLACE_TOOLS, ...CANVAS_TOOLS]` order. */
export function gridFavouriteItems(): DerivedFavouriteItem[] {
  const out: DerivedFavouriteItem[] = [];
  for (const group of ['organisieren', 'studio'] as const) {
    for (const tile of toolsWithTile(group)) {
      if (tile.path == null || tile.href != null) continue;
      out.push({ id: tile.id, title: tile.title, path: tile.path, icon: tile.icon });
    }
  }
  return out;
}

/** Dropdown-card tools pinnable from within the menu (internal routes only). */
export function menuFavouriteItems(): DerivedFavouriteItem[] {
  const out: DerivedFavouriteItem[] = [];
  for (const menu of toolMenus()) {
    for (const item of menu.items) {
      if (item.path == null || item.href != null) continue;
      out.push({ id: item.id, title: item.title, path: item.path, icon: item.icon });
    }
  }
  return out;
}
