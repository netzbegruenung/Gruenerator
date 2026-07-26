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
 * Single source of truth for the app's tools. The Arbeiten tab's "Werkzeuge"
 * strip, the Start screen's favorites and the drawer all render from this list,
 * so a tool is defined once and favorited by `id` via `useToolFavoritesStore`.
 *
 * Order and wording mirror web's `apps/web/src/config/toolRegistry.ts` — the
 * entries web marks `favourite: true` plus the Studio tiles, minus the ones with
 * no mobile route (Transkription, Zeichenzähler, the /studio hub). Ids are F1
 * frozen: `useToolFavoritesStore` persists them, so the five original mobile ids
 * keep their spelling even where web calls the same tool something else
 * (`ki-bildgenerierung` vs. web's `canvas-ki`).
 */
export const TOOLS: ToolDef[] = [
  {
    id: 'office',
    title: 'Office',
    description: 'Dokumente, Boards & Tabellen',
    icon: 'desktop',
    route: '/(tabs)/(office)',
  },
  {
    id: 'studio',
    title: 'Studio',
    description: 'KI-Bilder, Vorlagen & Reels',
    icon: 'color-palette',
    route: '/(tabs)/(tools)/studio',
  },
  {
    id: 'wissen',
    title: 'Wissen',
    description: 'Recherche & Notebooks',
    icon: 'book',
    route: '/(tabs)/(recherche)',
  },
  {
    id: 'agents',
    title: 'Grüneratoren',
    description: 'Grüneratoren & Rezepte',
    icon: 'people',
    route: '/(focused)/agents',
  },
  {
    id: 'projekte',
    title: 'Projekte',
    description: 'Chats & Inhalte bündeln',
    icon: 'people-circle',
    route: '/(focused)/gruppen',
  },
  // Websuche is parked: `/(tabs)/(recherche)/research` is reachable from the
  // Wissen screen, and a second entry point earned its own tile only on web.
  // {
  //   id: 'suche',
  //   title: 'Websuche',
  //   description: 'Recherche im Netz',
  //   icon: 'search',
  //   route: '/(tabs)/(recherche)/research',
  // },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Fotos zu Text',
    icon: 'scan',
    route: '/(tabs)/(tools)/scanner',
  },
];

/**
 * The Studio area's own tools, mirroring web's /studio landing strip. They are
 * deliberately NOT in `TOOLS`: the top level shows one "Studio" tile, and these
 * three live behind it — same split web makes between the `canvas` tool and its
 * `canvas-*` sub-tiles.
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

/** Every tool a favourite can point at — top level plus the Studio area. */
export const ALL_TOOLS: ToolDef[] = [...TOOLS, ...STUDIO_TOOLS];
