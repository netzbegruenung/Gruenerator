import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import { type AppRoute } from '../../types/routes';

export interface ToolDef {
  id: string;
  title: string;
  description: string;
  icon: IoniconsIconName;
  route: AppRoute;
}

/**
 * Tools that are NOT one of the four bottom tabs. Chat, Arbeiten, Studio and
 * Wissen are everyday surfaces and live in the tab bar; what is left reaches the
 * user through the drawer and the profile menu instead. The drawer renders this
 * list, so a tool is defined once and favorited by `id` via
 * `useToolFavoritesStore`.
 *
 * Ids are F1 frozen: the favourites store persists them, so they keep their
 * spelling even where the title changed (`agents` is titled "Agentura" now, and
 * `ki-bildgenerierung` is web's `canvas-ki`).
 */
export const TOOLS: ToolDef[] = [
  {
    id: 'agents',
    title: 'Agentura',
    description: 'Grüneratoren & Rezepte',
    icon: 'people',
    route: '/(focused)/agents',
  },
  {
    id: 'projekte',
    title: 'Projekte',
    description: 'Chats & Inhalte bündeln',
    icon: 'people-circle',
    route: '/(focused)/projekte',
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Fotos zu Text',
    icon: 'scan',
    route: '/(tabs)/(tools)/scanner',
  },
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
    icon: 'albums',
    route: '/(tabs)/(tools)/vorlagen',
  },
  {
    id: 'ki-bildgenerierung',
    title: 'KI-Bild',
    description: 'KI-Bilder erstellen',
    icon: 'sparkles',
    route: '/(focused)/bild-editor',
  },
  {
    id: 'reel',
    title: 'Reel',
    description: 'Untertitel für Clips',
    icon: 'videocam',
    route: '/(tabs)/(tools)/reel',
  },
];

/** Every tool a favourite can point at — drawer entries plus the Studio tab. */
export const ALL_TOOLS: ToolDef[] = [...TOOLS, ...STUDIO_TOOLS];
