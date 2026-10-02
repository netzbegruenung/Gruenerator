import { toolIconKey, type ToolIconKey } from '@gruenerator/shared/icons';
import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import { type AppRoute } from '../../types/routes';

export interface ToolDef {
  id: string;
  title: string;
  description: string;
  /** Shared glyph key — which icon a tool wears is decided in
   *  `@gruenerator/shared/icons`, so web and mobile cannot drift. */
  icon: ToolIconKey;
  route: AppRoute;
}

const AGENTURA: ToolDef = {
  id: 'agents',
  title: 'Agentura',
  description: 'Grüneratoren & Rezepte',
  icon: toolIconKey('agents'),
  route: '/(focused)/agents',
};

const PROJEKTE: ToolDef = {
  id: 'projekte',
  title: 'Projekte',
  description: 'Chats & Inhalte bündeln',
  icon: toolIconKey('projekte'),
  route: '/(focused)/projekte',
};

const SCANNER: ToolDef = {
  id: 'scanner',
  title: 'Scanner',
  description: 'Fotos zu Text',
  icon: toolIconKey('scanner'),
  route: '/(tabs)/(tools)/scanner',
};

/**
 * Tools that are NOT one of the four bottom tabs. Chat, Arbeiten, Studio and
 * Wissen are everyday surfaces and live in the tab bar; what is left reaches the
 * user through the drawer and the profile menu instead. The drawer renders this
 * list, so a tool is defined once and favorited by `id` via
 * `useToolFavoritesStore`. (In the workplace shell they are tiles on Arbeiten
 * as well, see `WORKPLACE_TILES`.)
 *
 * Ids are F1 frozen: the favourites store persists them, so they keep their
 * spelling even where the title changed (`agents` is titled "Agentura" now, and
 * `ki-bildgenerierung` is web's `canvas-ki`).
 */
export const TOOLS: ToolDef[] = [
  AGENTURA,
  PROJEKTE,
  SCANNER,
  // Websuche is parked: `/(tabs)/(recherche)/research` is reachable from the
  // Wissen tab, and a second entry point earned its own tile only on web.
  // {
  //   id: 'suche',
  //   title: 'Websuche',
  //   description: 'Recherche im Netz',
  //   icon: 'search',
  //   route: '/(tabs)/(recherche)/research',
  // },
];

/**
 * The Studio tab's own tools, mirroring web's /studio landing strip. Separate
 * from `TOOLS` because Studio is a tab: these are what its screen shows, not
 * drawer entries.
 */
export const STUDIO_TOOLS: ToolDef[] = [
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Design-Vorlagen',
    icon: toolIconKey('vorlagen'),
    route: '/(tabs)/(tools)/vorlagen',
  },
  {
    id: 'ki-bildgenerierung',
    title: 'KI-Bild',
    description: 'KI-Bilder erstellen',
    icon: toolIconKey('ki-bildgenerierung'),
    route: '/(focused)/bild-editor',
  },
  {
    id: 'reel',
    title: 'Reel',
    description: 'Untertitel für Clips',
    icon: toolIconKey('reel'),
    route: '/(tabs)/(tools)/reel',
  },
];

/**
 * Ionicons equivalents of the studio tools' shared glyph keys, for the places
 * that speak Ionicons (`EmptyState`, the create sheet's rows).
 */
export const STUDIO_TOOL_GLYPHS: Record<string, IoniconsIconName> = {
  vorlagen: 'albums',
  'ki-bildgenerierung': 'sparkles',
  reel: 'videocam',
};

/**
 * The tile row on top of Arbeiten in the workplace shell (`config/navLayout`),
 * in web's order (Agentura, Wissen, Projekte). Wissen stands in for the tab it
 * was; Scanner has no web tile but is the one mobile-only tool.
 */
export const WORKPLACE_TILES: ToolDef[] = [
  AGENTURA,
  {
    id: 'wissen',
    title: 'Wissen',
    description: 'Recherche & Notebooks',
    icon: toolIconKey('wissen'),
    route: '/(tabs)/(recherche)',
  },
  PROJEKTE,
  SCANNER,
];

/** Every tool a favourite can point at — drawer entries plus the Studio tab. */
export const ALL_TOOLS: ToolDef[] = [...TOOLS, ...STUDIO_TOOLS];
