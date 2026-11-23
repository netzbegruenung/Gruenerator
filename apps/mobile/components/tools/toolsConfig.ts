import { toolIconKey, type ToolIconKey } from '@gruenerator/shared/icons';
import { DOKU_URL, NEWSLETTER_SIGNUP_URL } from '@gruenerator/shared/links';

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

/** Agents, Rezepte, Vorlagen, Sticker und Hintergründe zum Holen (web: `tool-marktplatz`). */
const MARKTPLATZ: ToolDef = {
  id: 'marktplatz',
  title: 'Marktplatz',
  description: 'Agents, Rezepte, Vorlagen & Sticker',
  icon: toolIconKey('marktplatz'),
  route: '/(focused)/marktplatz',
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
 * The tools on top of Arbeiten, two rows of four: Grüneratoren, Wissen,
 * Projekte (web's order) and the Marktplatz, then Vorlagen, Übersetzer, Scanner
 * and „Weitere" — favourites first, the dock sorts. „Weitere" holds the rest,
 * the Doku and the newsletter as links, like web's Weitere menu. Scanner has no
 * web tile; it is the one mobile-only tool.
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
  MARKTPLATZ,
  VORLAGEN,
  {
    id: 'uebersetzer',
    title: 'Übersetzer',
    description: 'Texte & Dokumente übersetzen',
    icon: toolIconKey('uebersetzer'),
    route: '/(focused)/uebersetzer',
  },
  SCANNER,
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
