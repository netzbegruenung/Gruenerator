import { toolIconKey, type ToolIconKey } from '@gruenerator/shared/icons';
import { DOKU_URL, NEWSLETTER_SIGNUP_URL } from '@gruenerator/shared/links';
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

/** A tool that is a public page outside the app, opened in the in-app browser. */
export interface LinkToolDef {
  id: string;
  title: string;
  description: string;
  icon: ToolIconKey;
  href: string;
}

export type WorkplaceTool = ToolDef | LinkToolDef;

export const isLinkTool = (tool: WorkplaceTool): tool is LinkToolDef => 'href' in tool;

const GRUENERATOREN: ToolDef = {
  id: 'agents',
  title: 'Grüneratoren',
  description: 'Agents, Rezepte & Aufgaben',
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

const VORLAGEN: ToolDef = {
  id: 'vorlagen',
  title: 'Vorlagen',
  description: 'Design-Vorlagen',
  icon: toolIconKey('vorlagen'),
  route: '/(focused)/vorlagen',
};

/**
 * The Studio tools, mirroring web's /studio landing strip: the create menu on
 * Arbeiten, and the drawer once starred.
 */
export const STUDIO_TOOLS: ToolDef[] = [
  // One entry for KI-Bild and Sharepic: the Bild-Editor switches between them,
  // as on web. The id stays (F1, favourites persist it); a starred `sharepic`
  // is shown as this one, see `ThreadListDrawer`.
  {
    id: 'ki-bildgenerierung',
    title: 'Bild erstellen',
    description: 'KI-Bild oder Sharepic',
    icon: toolIconKey('ki-bildgenerierung'),
    route: '/(focused)/bild-editor',
  },
  {
    id: 'reel',
    title: 'Reel',
    description: 'Untertitel für Clips',
    icon: toolIconKey('reel'),
    route: '/(focused)/reel',
  },
  {
    id: 'profilbild',
    title: 'Profilbild',
    description: 'Freistellen, Hintergrund, Sticker',
    icon: toolIconKey('profilbild'),
    route: '/(focused)/profilbild',
  },
  {
    id: 'sticker',
    title: 'Sticker & Hintergründe',
    description: 'Sticker erstellen, teilen & entdecken',
    icon: toolIconKey('sticker'),
    route: '/(focused)/sticker',
  },
];

/**
 * Ionicons equivalents of the studio tools' shared glyph keys, for the places
 * that speak Ionicons (`EmptyState`, the create sheet's rows).
 */
export const STUDIO_TOOL_GLYPHS: Record<string, IoniconsIconName> = {
  'ki-bildgenerierung': 'sparkles',
  reel: 'videocam',
  profilbild: 'person-circle',
  sticker: 'happy',
};

/**
 * The tools on top of Arbeiten, in web's order (Grüneratoren, Wissen, Projekte);
 * the dock shows the first three, favourites first, and the rest open from
 * „Weitere" — web's Weitere menu: Übersetzer, then the Doku and the newsletter
 * as links. Scanner has no web tile but is the one mobile-only tool; Vorlagen
 * sits next to it instead of in the create menu.
 *
 * Ids are F1 frozen: the favourites store persists them, so they keep their
 * spelling even where the title changed (`agents` is titled "Grüneratoren" now).
 */
export const WORKPLACE_TILES: WorkplaceTool[] = [
  GRUENERATOREN,
  {
    id: 'wissen',
    title: 'Wissen',
    description: 'Recherche & Notebooks',
    icon: toolIconKey('wissen'),
    route: '/(focused)/wissen',
  },
  PROJEKTE,
  SCANNER,
  VORLAGEN,
  {
    id: 'uebersetzer',
    title: 'Übersetzer',
    description: 'Texte & Dokumente übersetzen',
    icon: toolIconKey('uebersetzer'),
    route: '/(focused)/uebersetzer',
  },
  {
    id: 'doku',
    title: 'Doku',
    description: 'Anleitungen & Hilfe',
    icon: toolIconKey('doku'),
    href: DOKU_URL,
  },
  {
    id: 'newsletter',
    title: 'Newsletter',
    description: 'Updates abonnieren',
    icon: toolIconKey('newsletter'),
    href: NEWSLETTER_SIGNUP_URL,
  },
];
