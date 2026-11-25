/**
 * LITERAL MIRROR of config/toolRegistry.ts — edit tools THERE first.
 *
 * The docs generators (documentation/scripts/generate-ui-labels.mjs and
 * generate-tool-catalog.mjs) AST-parse this file and require plain array
 * literals, so these values cannot be derived at runtime. The mirror is kept in
 * lockstep with the registry twice over: `satisfies` pins every id to a
 * registry id, and toolRegistry.vitest.ts asserts each array deep-equals its
 * registry-derived counterpart.
 */
import {
  isChannelVisibleIn,
  isToolOfferedIn,
  type InstanceChannel,
} from '@gruenerator/shared/instances';

import { getIcon } from './icons';
import { CURRENT_INSTANCE } from './instance';
import { NEWSLETTER_SIGNUP_URL } from './newsletter';

import type { IconType } from './icons';
import type { OfficeCreateKind, OfficeSuiteActionId, ToolAudience, ToolId } from './toolRegistry';

import { PiGlobe } from '@/config/shellIcons.generated';

export { type OfficeCreateKind } from './toolRegistry';

type RegisteredTile = WorkplaceToolItem & { id: ToolId };
type RegisteredMenuItem = WorkplaceToolMenuItem & { id: ToolId };
type RegisteredMenu = Omit<WorkplaceToolMenu, 'items'> & {
  id: ToolId;
  items: RegisteredMenuItem[];
};
type RegisteredSuiteTool = OfficeSuiteTool & { id: OfficeSuiteActionId };

export interface WorkplaceToolItem {
  id: string;
  title: string;
  description: string;
  /** Internal route (rendered as a router Link). Mutually exclusive with `href`. */
  path?: string;
  /** External URL (rendered as a new-tab anchor). Mutually exclusive with `path`. */
  href?: string;
  audience?: ToolAudience;
  icon: IconType;
  channel?: InstanceChannel;
  /** Small label top-right on the tile, e.g. „Neu". */
  badge?: string;
}

/** A single entry inside a dropdown tool card. Rendered as a tool-card row. */
interface WorkplaceToolMenuItem {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  /** Internal route. Mutually exclusive with `href`. */
  path?: string;
  /** External URL (opened in a new tab). Mutually exclusive with `path`. */
  href?: string;
}

/** A tool card that opens a dropdown of related tools instead of navigating. */
interface WorkplaceToolMenu {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  items: WorkplaceToolMenuItem[];
}

// The office suite, now bundled behind a single "Office" group tile on the
// Arbeiten tab (mirroring how "Bilder & Videos" fronts the /studio sub-tools).
// The four apps live in OFFICE_SUITE_TOOLS and are surfaced on the /office
// landing page.
export const OFFICE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'office',
    title: 'Office',
    description: 'Dokumente, Boards, Tabellen & Slides',
    path: '/office',
    icon: getIcon('navigation', 'desk')!,
  },
  {
    id: 'canvas',
    title: 'Studio',
    description: 'Videos, Sharepics, KI-Bilder & Uploads',
    path: '/studio',
    icon: getIcon('navigation', 'sharepic')!,
  },
  {
    id: 'wissen',
    title: 'Notebooks',
    description: 'Programme & Beschlüsse befragen',
    path: '/marktplatz?art=notebooks',
    icon: getIcon('navigation', 'notebooks')!,
  },
] satisfies RegisteredTile[];

/** An action tile on the /office landing page. Unlike WorkplaceToolItem these
 * don't navigate to a page — they create an empty resource (or open the template
 * gallery) in place. `id` doubles as the toolTheme key so each keeps its colour. */
export interface OfficeSuiteTool {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  create: OfficeCreateKind;
}

// The office action tiles on the /office landing page: "Vorlagen" opens the
// template gallery; the rest create an empty document/board/sheet/presentation
// and open its editor directly (see DocumentsContent's officeToolStrip). `id`
// matches the toolTheme key so each tile keeps its colour.
export const OFFICE_SUITE_TOOLS: OfficeSuiteTool[] = [
  {
    id: 'vorlagen',
    title: 'Vorlagen',
    description: 'Aus Vorlage starten',
    icon: getIcon('navigation', 'vorlagen')!,
    create: 'gallery',
  },
  {
    id: 'docs',
    title: 'Leeres Dokument',
    description: 'Leeres Textdokument',
    icon: getIcon('navigation', 'docs')!,
    create: 'doc',
  },
  {
    id: 'boards',
    title: 'Leeres Board',
    description: 'Leeres Kanban-Board',
    icon: getIcon('navigation', 'boards')!,
    create: 'board',
  },
  {
    id: 'sheets',
    title: 'Leere Tabelle',
    description: 'Leere Kalkulationstabelle',
    icon: getIcon('navigation', 'sheets')!,
    create: 'sheet',
  },
  {
    id: 'presentations',
    title: 'Leere Präsentation',
    description: 'Leere Foliensammlung',
    icon: getIcon('navigation', 'presentations')!,
    create: 'pres',
  },
] satisfies RegisteredSuiteTool[];

// The action cards of the /studio page (Studio design 11/2026). Sharepics are
// made in the chat, so the first card opens it with an order already typed in.
export const CANVAS_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'canvas-ki',
    title: 'Sharepic im Chat erstellen',
    description: 'Thema nennen, Entwürfe bekommen',
    path: '/chat',
    icon: getIcon('navigation', 'messenger')!,
  },
  {
    id: 'studio-videoeditor',
    title: 'Video-Editor',
    description: 'Reels mit Schnitt, Text & Musik',
    path: '/studio/videoeditor',
    icon: getIcon('navigation', 'videoEditor')!,
    badge: 'Neu',
  },
  {
    id: 'reels-untertitel',
    title: 'Auto-Untertitel',
    description: 'Videos automatisch untertiteln',
    path: '/studio/video',
    icon: getIcon('navigation', 'reel')!,
  },
] satisfies RegisteredTile[];

// Creation tools that join the colored "Office" strip on the Arbeiten tab.
// (Reels moved to the /studio "Bilder & Videos" landing; "Bilder & Videos"
// covers KI-Bilder, Sharepics and Reels now.)
export const WORKPLACE_TOOLS: WorkplaceToolItem[] = [
  {
    id: 'marktplatz',
    title: 'Marktplatz',
    description: 'Agents, Rezepte & Vorlagen entdecken',
    path: '/marktplatz',
    icon: getIcon('navigation', 'marktplatz')!,
    badge: 'Neu',
  },
  {
    id: 'projekte',
    title: 'Projekte',
    description: 'Chats & Inhalte bündeln',
    path: '/projekte',
    icon: getIcon('navigation', 'projekte')!,
  },
  {
    id: 'sites',
    title: 'Sites',
    description: 'Website für deine Kandidatur',
    path: '/sites',
    icon: PiGlobe,
    badge: 'Neu',
  },
] satisfies RegisteredTile[];

// Single "Weitere" dropdown tile (Verbinden merged in) — the utility tools plus
// the connect options under one roof. Rendered as a tile in the Office strip.
export const TOOL_MENUS: WorkplaceToolMenu[] = [
  {
    id: 'weitere',
    title: 'Weitere',
    description: 'Mehr Werkzeuge',
    icon: getIcon('navigation', 'tools')!,
    items: [
      {
        id: 'uebersetzer',
        title: 'Übersetzer',
        description: 'Texte & Dokumente übersetzen',
        path: '/uebersetzer',
        icon: getIcon('navigation', 'uebersetzer')!,
      },
      {
        id: 'mcp',
        title: 'Apps & MCP',
        description: 'ChatGPT & Co verbinden',
        path: '/apps',
        icon: getIcon('actions', 'link')!,
      },
      {
        id: 'transkription',
        title: 'Transkription',
        description: 'Audio zu Text',
        path: '/transkription',
        icon: getIcon('navigation', 'transkription')!,
      },
      {
        id: 'scanner',
        title: 'Scanner',
        description: 'Fotos & Scans zu Text',
        path: '/scanner',
        icon: getIcon('navigation', 'scanner')!,
      },
      {
        id: 'zeichenzaehler',
        title: 'Zeichenzähler',
        description: 'Wörter zählen',
        path: '/zeichenzaehler',
        icon: getIcon('navigation', 'zeichenzaehler')!,
      },
      {
        id: 'newsletter',
        title: 'Newsletter',
        description: 'Updates abonnieren',
        href: NEWSLETTER_SIGNUP_URL,
        icon: getIcon('navigation', 'presse-social')!,
      },
      {
        id: 'transparenz',
        title: 'Transparenz',
        description: 'Verbrauch & CO₂ des Grünerators',
        path: '/transparenz',
        icon: getIcon('navigation', 'transparenz')!,
      },
    ],
  },
] satisfies RegisteredMenu[];

/**
 * Channel visibility (maturity) plus the instance's `hide.toolIds` (per-instance
 * curation, e.g. bgst hiding Vorlagen/Reels) — both no-ops for instances that
 * don't set them. Generic so it also covers `OFFICE_SUITE_TOOLS`, whose items
 * share the `id` shape but aren't `WorkplaceToolItem`s.
 */
export function filterWorkplaceTools<T extends { id: string; channel?: InstanceChannel }>(
  tools: T[]
): T[] {
  return tools.filter(
    (tool) =>
      isChannelVisibleIn(tool.channel, CURRENT_INSTANCE) &&
      isToolOfferedIn(tool.id, CURRENT_INSTANCE)
  );
}

/** A tool can be pinned to the sidebar only if it has an internal route. */
export function isFavouritableTool(tool: WorkplaceToolItem): tool is WorkplaceToolItem & {
  path: string;
} {
  return Boolean(tool.path) && !tool.href;
}
