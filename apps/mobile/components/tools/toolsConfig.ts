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
  route: '/(focused)/scanner',
};

/**
 * The Studio tools, mirroring web's /studio landing strip: the create menu on
 * Arbeiten, and the drawer once starred.
 */
export const STUDIO_TOOLS: ToolDef[] = [
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Design-Vorlagen',
    icon: toolIconKey('vorlagen'),
    route: '/(focused)/vorlagen',
  },
  {
    id: 'ki-bildgenerierung',
    title: 'KI-Bild',
    description: 'KI-Bilder erstellen',
    icon: toolIconKey('ki-bildgenerierung'),
    route: '/(focused)/bild-editor',
  },
  {
    id: 'sharepic',
    title: 'Sharepic',
    description: 'Aus Freitext',
    icon: toolIconKey('sharepic'),
    route: '/(focused)/sharepic',
  },
  {
    id: 'reel',
    title: 'Reel',
    description: 'Untertitel für Clips',
    icon: toolIconKey('reel'),
    route: '/(focused)/reel',
  },
];

/**
 * Ionicons equivalents of the studio tools' shared glyph keys, for the places
 * that speak Ionicons (`EmptyState`, the create sheet's rows).
 */
export const STUDIO_TOOL_GLYPHS: Record<string, IoniconsIconName> = {
  vorlagen: 'albums',
  'ki-bildgenerierung': 'sparkles',
  sharepic: 'image',
  reel: 'videocam',
};

/**
 * The tile row on top of Arbeiten, in web's order (Agentura, Wissen, Projekte).
 * Scanner has no web tile but is the one mobile-only tool.
 *
 * Ids are F1 frozen: the favourites store persists them, so they keep their
 * spelling even where the title changed (`agents` is titled "Agentura" now).
 */
export const WORKPLACE_TILES: ToolDef[] = [
  AGENTURA,
  {
    id: 'wissen',
    title: 'Wissen',
    description: 'Recherche & Notebooks',
    icon: toolIconKey('wissen'),
    route: '/(focused)/wissen',
  },
  PROJEKTE,
  SCANNER,
];
