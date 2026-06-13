import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import { NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';
import {
  PiGlobeHemisphereWest,
  PiFlask,
  PiFiles,
  PiChatCircleDots,
  PiNote,
  PiPaintBrush,
  PiTreeEvergreen,
  PiImage,
  PiImagesSquare,
  PiClipboardText,
  PiFileText,
  PiPaperclip,
  PiSparkle,
  PiCloud,
  PiNotePencil,
  PiPlugsConnected,
  PiChartBar,
} from '@gruenerator/shared/icons';
import { agentsList, type AgentListItem } from './agents';

export type MentionableType =
  | 'agent'
  | 'notebook'
  | 'tool'
  | 'document'
  | 'board'
  | 'doc'
  | 'wolke'
  | 'connect'
  | 'canva'
  | 'vorlagen';
export type MentionableCategory = 'skill' | 'function';

export interface Mentionable {
  type: MentionableType;
  category: MentionableCategory;
  trigger: '@' | '/';
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  backgroundColor: string;
  mention: string;
  skillCategory?: import('./agents').SkillCategory;
  promptTemplate?: string;
  isSystemDefault?: boolean;
  iconKey?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Locale visibility (skills/agents): de-DE / de-AT / all. Undefined ≈ all. */
  audience?: 'de-DE' | 'de-AT' | 'all';
}

export interface CustomAgentMentionable {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

// Per-LV icon overrides for the Öffentlichkeitsarbeit-<lv> agents and their
// /presse-<lv>, /social-<lv> skills. Mirrors the icons used on the matching
// notebook entries in `apps/web/src/features/notebook/config/notebooksConfig.ts`
// so the visual identity stays consistent between notebook gallery, sidebar,
// "Alle Agents" modal, and the /-mention picker.
const AGENT_ICON_OVERRIDES: Record<string, React.ComponentType<{ className?: string }>> = {
  'gruenerator-oeffentlichkeitsarbeit-berlin': NOTEBOOK_ICONS['berlin-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-hamburg': NOTEBOOK_ICONS['hamburg-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern':
    NOTEBOOK_ICONS['mecklenburg-vorpommern-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-thueringen': NOTEBOOK_ICONS['thueringen-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-brandenburg': NOTEBOOK_ICONS['brandenburg-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-schleswig-holstein':
    NOTEBOOK_ICONS['schleswig-holstein-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-bayern': NOTEBOOK_ICONS['bayern-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-sachsen-anhalt': NOTEBOOK_ICONS['sachsen-anhalt-notebook'],
  'gruenerator-oeffentlichkeitsarbeit-hessen': NOTEBOOK_ICONS['hessen-notebook'],
};

export function agentToMentionable(agent: AgentListItem): Mentionable {
  // Per-skill `agent.icon` wins over the legacy identifier-keyed override map
  // so PM-<LV> and Social-<LV> variants can carry distinct icons even though
  // they share an agent identifier.
  const icon = agent.icon ?? AGENT_ICON_OVERRIDES[agent.identifier];
  return {
    type: 'agent',
    category: 'skill',
    trigger: '/',
    identifier: agent.identifier,
    title: agent.title,
    description: agent.description,
    avatar: agent.avatar,
    backgroundColor: agent.backgroundColor,
    mention: agent.mention,
    skillCategory: agent.skillCategory,
    promptTemplate: agent.promptTemplate,
    isSystemDefault: agent.isSystemDefault,
    ...(agent.iconKey ? { iconKey: agent.iconKey } : {}),
    ...(agent.audience ? { audience: agent.audience } : {}),
    ...(icon ? { icon } : {}),
  };
}

export function customAgentToMentionable(agent: CustomAgentMentionable): Mentionable {
  return {
    type: 'agent',
    category: 'skill',
    trigger: '/',
    identifier: agent.id,
    title: agent.name,
    description: agent.description || '',
    avatar: '🤖',
    backgroundColor: '#316049',
    mention: agent.slug,
  };
}

export const agentMentionables: Mentionable[] = agentsList.map(agentToMentionable);

// Locale for filtering agent/skill mentionables in the picker. Set by the host
// app (mirrors `setCustomAgents`). Resolution stays locale-agnostic so existing
// @mentions in old threads still resolve regardless of the current locale.
let mentionLocale = 'de-DE';

export function setMentionLocale(locale: string): void {
  mentionLocale = locale;
}

/** Agent/skill mentionables visible for the current locale (de-DE/de-AT/all). */
export function getAgentMentionables(): Mentionable[] {
  return agentMentionables.filter(
    (m) => m.audience === undefined || m.audience === 'all' || m.audience === mentionLocale
  );
}

let customAgentMentionables: Mentionable[] = [];

export function setCustomAgents(agents: CustomAgentMentionable[]): void {
  customAgentMentionables = agents.map(customAgentToMentionable);
  rebuildMentionableMap();
}

export function getCustomAgentMentionables(): Mentionable[] {
  return customAgentMentionables;
}

// Derived from the shared notebook registry so the @-mention picker always matches the
// web/mobile galleries. Adding a notebook to `@gruenerator/shared/notebooks` surfaces it
// here automatically; the icon is resolved by id from the shared NOTEBOOK_ICONS map.
export const notebookMentionables: Mentionable[] = NOTEBOOK_REGISTRY.map((nb) => ({
  type: 'notebook',
  category: 'function',
  trigger: '@',
  identifier: nb.id,
  title: nb.mention.title,
  description: nb.mention.description,
  avatar: nb.mention.avatar,
  icon: NOTEBOOK_ICONS[nb.id],
  backgroundColor: nb.mention.backgroundColor,
  mention: nb.mention.alias,
}));

export const toolMentionables: Mentionable[] = [
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'web',
    title: 'Websuche',
    description: 'Aktuelle Infos aus dem Web',
    avatar: '🌐',
    icon: PiGlobeHemisphereWest,
    backgroundColor: '#2563EB',
    mention: 'websearch',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'research',
    title: 'Recherche',
    description: 'Tiefgehende Multi-Quellen-Recherche',
    avatar: '🔬',
    icon: PiFlask,
    backgroundColor: '#7C3AED',
    mention: 'recherche',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'search',
    title: 'Dokumente',
    description: 'Parteiprogramme & Beschlüsse durchsuchen',
    avatar: '📄',
    icon: PiFiles,
    backgroundColor: '#316049',
    mention: 'dokumente',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'umfragen',
    title: 'Umfragen',
    description: 'Meinungsumfragen & Sonntagsfrage durchsuchen',
    avatar: '📊',
    icon: PiChartBar,
    backgroundColor: '#F59E0B',
    mention: 'umfragen',
    promptTemplate: 'Suche aktuelle Umfragen zu ',
    audience: 'all',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'documentchat',
    title: 'Dokument-Chat',
    description: 'Mit ausgewählten Dokumenten chatten',
    avatar: '💬',
    icon: PiChatCircleDots,
    backgroundColor: '#6366F1',
    mention: 'dokumentchat',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'summary',
    title: 'Zusammenfassung',
    description: 'Dokument(e) zusammenfassen',
    avatar: '📝',
    icon: PiNote,
    backgroundColor: '#0891B2',
    mention: 'zusammenfassung',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'image',
    title: 'Bildgenerierung',
    description: 'Bild mit KI generieren (Flux)',
    avatar: '🎨',
    icon: PiPaintBrush,
    backgroundColor: '#D97706',
    mention: 'bildgenerieren',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'image_edit',
    title: 'Stadt begrünen',
    description: 'Stadtbild mit Grün transformieren',
    avatar: '🌳',
    icon: PiTreeEvergreen,
    backgroundColor: '#059669',
    mention: 'stadtbegruenen',
  },
  {
    type: 'tool',
    category: 'function',
    trigger: '@',
    identifier: 'image_edit_universal',
    title: 'Bild bearbeiten',
    description: 'Angehängtes Bild frei bearbeiten (z.B. "jünger machen", "mehr Grün")',
    avatar: '🖼️',
    icon: PiImage,
    backgroundColor: '#059669',
    mention: 'bildbearbeiten',
  },
  ...(typeof document !== 'undefined' && process.env.NODE_ENV !== 'production'
    ? [
        {
          type: 'tool' as const,
          category: 'function' as const,
          trigger: '@' as const,
          identifier: 'sharepic',
          title: 'Sharepic',
          description:
            'Sharepic-Varianten erstellen und per Chat bearbeiten (Text, Bild, Farben, Position)',
          avatar: '🖼️',
          icon: PiImagesSquare,
          backgroundColor: '#46962b',
          mention: 'sharepic',
        },
      ]
    : []),
];

export interface BoardMentionable {
  id: string;
  title: string;
  slug: string;
}

export const boardToolMentionables: Mentionable[] = [
  {
    type: 'board',
    category: 'function',
    trigger: '@',
    identifier: 'board-erstellen',
    title: 'Board erstellen',
    description: 'Erstellt ein Board aus dem Chatverlauf',
    avatar: '✨',
    icon: PiSparkle,
    backgroundColor: '#7C3AED',
    mention: 'board-erstellen',
  },
];

let dynamicBoardMentionables: Mentionable[] = [];

export function setBoardMentionables(boards: BoardMentionable[]): void {
  dynamicBoardMentionables = boards.map((b) => ({
    type: 'board' as const,
    category: 'function' as const,
    trigger: '@' as const,
    identifier: b.id,
    title: b.title,
    description: `Board: ${b.title}`,
    avatar: '📋',
    icon: PiClipboardText,
    backgroundColor: '#316049',
    mention: b.slug,
  }));
  rebuildMentionableMap();
}

export function getBoardMentionables(): Mentionable[] {
  return [...boardToolMentionables, ...dynamicBoardMentionables];
}

export const docToolMentionables: Mentionable[] = [
  {
    type: 'doc',
    category: 'function',
    trigger: '@',
    identifier: 'dokument-erstellen',
    title: 'Dokument erstellen',
    description: 'Erstellt ein Dokument aus dem Chatverlauf',
    avatar: '📝',
    icon: PiNote,
    backgroundColor: '#0891B2',
    mention: 'dokument-erstellen',
  },
  {
    type: 'doc',
    category: 'function',
    trigger: '@',
    identifier: 'docs-picker-trigger',
    title: 'Dokument einfuegen',
    description: 'Kollaboratives Dokument als Kontext hinzufuegen',
    avatar: '📄',
    icon: PiFileText,
    backgroundColor: '#0891B2',
    mention: 'docs',
  },
];

export interface DocMentionable {
  id: string;
  title: string;
  slug: string;
}

let dynamicDocMentionables: Mentionable[] = [];

export function setDocMentionables(docs: DocMentionable[]): void {
  dynamicDocMentionables = docs.map((d) => ({
    type: 'doc' as const,
    category: 'function' as const,
    trigger: '@' as const,
    identifier: d.id,
    title: d.title,
    description: d.title,
    avatar: '📝',
    icon: PiFileText,
    backgroundColor: '#0891B2',
    mention: d.slug,
  }));
  rebuildMentionableMap();
}

export function getDocMentionables(): Mentionable[] {
  return [...docToolMentionables, ...dynamicDocMentionables];
}

export interface UserNotebookMentionable {
  id: string;
  title: string;
  slug: string;
}

let dynamicUserNotebookMentionables: Mentionable[] = [];

export function setUserNotebookMentionables(notebooks: UserNotebookMentionable[]): void {
  dynamicUserNotebookMentionables = notebooks.map((n) => ({
    type: 'notebook' as const,
    category: 'function' as const,
    trigger: '@' as const,
    identifier: n.id,
    title: n.title,
    description: `Mein Notizbuch: ${n.title}`,
    avatar: '📓',
    icon: PiNotePencil,
    backgroundColor: '#316049',
    mention: n.slug,
  }));
  rebuildMentionableMap();
}

export function getUserNotebookMentionables(): Mentionable[] {
  return dynamicUserNotebookMentionables;
}

export const documentMentionables: Mentionable[] = [
  {
    type: 'document',
    category: 'function',
    trigger: '@',
    identifier: 'datei-trigger',
    title: 'Datei auswählen',
    description: 'Dokument aus einem Notizbuch referenzieren',
    avatar: '📎',
    icon: PiPaperclip,
    backgroundColor: '#6366F1',
    mention: 'datei',
  },
];

// @wolke opens a sub-popover that lets the user pick files from their
// connected Nextcloud share link(s). Selected files are inserted into the
// text as opaque `@wolke:<base64>` tokens which the parser decodes back into
// {shareLinkId, path, name} refs sent in the request body.
export const wolkeMentionables: Mentionable[] = [
  {
    type: 'wolke',
    category: 'function',
    trigger: '@',
    identifier: 'wolke-trigger',
    title: 'Wolke',
    description: 'Eigene Wolke-Dateien einfügen',
    avatar: '☁️',
    icon: PiCloud,
    backgroundColor: '#0EA5E9',
    mention: 'wolke',
  },
];

export interface WolkeFileToken {
  shareLinkId: string;
  path: string;
  name: string;
}

// Base64-url encoding so the resulting token has no spaces, '/', or '+'
// characters that would break the `(\S+)` mention regex.
// Node's Buffer is only the fallback for runtimes lacking the Web btoa/atob
// globals; access it via globalThis so this shared module needs no @types/node
// in React Native consumers.
const nodeBuffer = (
  globalThis as {
    Buffer?: { from(data: string, encoding: string): { toString(encoding: string): string } };
  }
).Buffer;

function toBase64Url(input: string): string {
  if (typeof globalThis.btoa === 'function') {
    return globalThis
      .btoa(unescape(encodeURIComponent(input)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return nodeBuffer!
    .from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const full = padded + pad;
  if (typeof globalThis.atob === 'function') {
    return decodeURIComponent(escape(globalThis.atob(full)));
  }
  return nodeBuffer!.from(full, 'base64').toString('utf-8');
}

export function encodeWolkeToken(ref: WolkeFileToken): string {
  return `@wolke:${toBase64Url(JSON.stringify(ref))}`;
}

export function decodeWolkeToken(token: string): WolkeFileToken | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).shareLinkId === 'string' &&
      typeof (parsed as Record<string, unknown>).path === 'string' &&
      typeof (parsed as Record<string, unknown>).name === 'string'
    ) {
      return parsed as WolkeFileToken;
    }
    return null;
  } catch {
    return null;
  }
}

// @connect opens a sub-popover that lets the user pick files from their
// Nango-connected provider accounts (Microsoft / Google / Jira / Confluence).
// Selected files are inserted into the text as opaque `@connect:<base64>`
// tokens which the parser decodes back into {provider, fileId, name, mimeType}
// refs sent in the request body. Mirrors the @wolke pipeline (Nextcloud).
export const connectMentionables: Mentionable[] = [
  {
    type: 'connect',
    category: 'function',
    trigger: '@',
    identifier: 'connect-trigger',
    title: 'Verbundene Accounts',
    description: 'Dateien aus verbundenen Diensten einfügen',
    avatar: '🔌',
    icon: PiPlugsConnected,
    backgroundColor: '#7C3AED',
    mention: 'connect',
  },
];

export interface ConnectFileToken {
  provider: string;
  fileId: string;
  name: string;
  mimeType?: string;
}

export function encodeConnectToken(ref: ConnectFileToken): string {
  return `@connect:${toBase64Url(JSON.stringify(ref))}`;
}

export function decodeConnectToken(token: string): ConnectFileToken | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).provider === 'string' &&
      typeof (parsed as Record<string, unknown>).fileId === 'string' &&
      typeof (parsed as Record<string, unknown>).name === 'string'
    ) {
      return parsed as ConnectFileToken;
    }
    return null;
  } catch {
    return null;
  }
}

// @canva opens a sub-popover that lists the user's Canva designs (fetched live
// from the Connect API via React Query). Picking designs inserts a markdown
// link per design into the composer — a direct "insert the design" reference,
// not a RAG document source (designs are visual, not text). Mirrors the
// trigger-then-picker UX of @wolke/@connect.
export const canvaMentionables: Mentionable[] = [
  {
    type: 'canva',
    category: 'function',
    trigger: '@',
    identifier: 'canva-trigger',
    title: 'Canva',
    description: 'Eigene Canva-Designs einfügen',
    avatar: '🎨',
    icon: PiPaintBrush,
    backgroundColor: '#00C4CC',
    mention: 'canva',
  },
];

export interface CanvaDesignToken {
  id: string;
  title: string;
  viewUrl: string;
  thumbnailUrl?: string;
}

// @vorlagen opens a sub-popover that semantically searches the user's published
// Vorlagen (templates) via the vector index. Picking templates inserts a
// markdown link per template into the composer — a direct reference, mirroring
// @canva. Dev-only for now (feature in development): hidden in production.
export const vorlagenMentionables: Mentionable[] =
  process.env.NODE_ENV !== 'production'
    ? [
        {
          type: 'vorlagen',
          category: 'function',
          trigger: '@',
          identifier: 'vorlagen-trigger',
          title: 'Vorlagen',
          description: 'Passende Vorlagen per Vektorsuche einfügen',
          avatar: '📋',
          icon: PiClipboardText,
          backgroundColor: '#316049',
          mention: 'vorlagen',
        },
      ]
    : [];

export interface VorlageToken {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
}

export function getAllMentionables(): Mentionable[] {
  return [
    ...getAgentMentionables(),
    ...customAgentMentionables,
    ...dynamicUserNotebookMentionables,
    ...notebookMentionables,
    ...toolMentionables,
    ...boardToolMentionables,
    ...dynamicBoardMentionables,
    ...docToolMentionables,
    ...dynamicDocMentionables,
    ...documentMentionables,
    ...wolkeMentionables,
    ...connectMentionables,
    ...canvaMentionables,
    ...vorlagenMentionables,
  ];
}

const mentionableMap = new Map<string, Mentionable>();

function rebuildMentionableMap(): void {
  mentionableMap.clear();
  const orderedSources = [
    agentMentionables,
    customAgentMentionables,
    dynamicUserNotebookMentionables,
    notebookMentionables,
    toolMentionables,
    boardToolMentionables,
    dynamicBoardMentionables,
    docToolMentionables,
    dynamicDocMentionables,
    documentMentionables,
    wolkeMentionables,
    connectMentionables,
    canvaMentionables,
    vorlagenMentionables,
  ];
  for (const source of orderedSources) {
    for (const m of source) {
      const key = m.mention.toLowerCase();
      if (!mentionableMap.has(key)) {
        mentionableMap.set(key, m);
      }
    }
  }
}

// Initialize on load
rebuildMentionableMap();

export function resolveMentionable(alias: string): Mentionable | null {
  return mentionableMap.get(alias.toLowerCase()) ?? null;
}

export function filterMentionables(query: string): {
  agents: Mentionable[];
  customAgents: Mentionable[];
  notebooks: Mentionable[];
  userNotebooks: Mentionable[];
  tools: Mentionable[];
  boards: Mentionable[];
  docs: Mentionable[];
  documents: Mentionable[];
  wolke: Mentionable[];
  connect: Mentionable[];
  canva: Mentionable[];
  vorlagen: Mentionable[];
} {
  const allBoards = [...boardToolMentionables, ...dynamicBoardMentionables];
  const allDocs = [...docToolMentionables, ...dynamicDocMentionables];
  if (!query) {
    return {
      agents: getAgentMentionables(),
      customAgents: customAgentMentionables,
      notebooks: notebookMentionables,
      userNotebooks: dynamicUserNotebookMentionables,
      tools: toolMentionables,
      boards: allBoards,
      docs: allDocs,
      documents: documentMentionables,
      wolke: wolkeMentionables,
      connect: connectMentionables,
      canva: canvaMentionables,
      vorlagen: vorlagenMentionables,
    };
  }
  const q = query.toLowerCase();
  const matchFn = (m: Mentionable) =>
    m.mention.toLowerCase().includes(q) ||
    m.title.toLowerCase().includes(q) ||
    m.identifier.toLowerCase().includes(q);

  const isNotebookCategoryQuery =
    'notebook'.startsWith(q) ||
    q.startsWith('notebook') ||
    'notizbuch'.startsWith(q) ||
    q.startsWith('notizbuch') ||
    'notiz'.startsWith(q) ||
    q.startsWith('notiz');

  return {
    agents: getAgentMentionables().filter(matchFn),
    customAgents: customAgentMentionables.filter(matchFn),
    notebooks: isNotebookCategoryQuery
      ? notebookMentionables
      : notebookMentionables.filter(matchFn),
    userNotebooks: isNotebookCategoryQuery
      ? dynamicUserNotebookMentionables
      : dynamicUserNotebookMentionables.filter(matchFn),
    tools: toolMentionables.filter(matchFn),
    boards: 'board'.startsWith(q) || q.startsWith('board') ? allBoards : allBoards.filter(matchFn),
    docs: 'dok'.startsWith(q) || q.startsWith('dok') ? allDocs : allDocs.filter(matchFn),
    documents: documentMentionables.filter(matchFn),
    wolke: wolkeMentionables.filter(matchFn),
    connect: connectMentionables.filter(matchFn),
    canva: canvaMentionables.filter(matchFn),
    vorlagen: vorlagenMentionables.filter(matchFn),
  };
}

export function filterMentionablesByCategory(
  query: string,
  category: MentionableCategory
): Mentionable[] {
  const all = filterMentionables(query);
  if (category === 'skill') {
    return [...all.agents, ...all.customAgents];
  }
  return [
    ...all.tools,
    ...all.boards,
    ...all.docs,
    ...all.documents,
    ...all.wolke,
    ...all.connect,
    ...all.canva,
    ...all.vorlagen,
    ...all.userNotebooks,
    ...all.notebooks,
  ];
}
