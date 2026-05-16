import {
  PiMagnifyingGlass,
  PiBooks,
  PiBank,
  PiCompass,
  PiMapPin,
  PiTree,
  PiGlobe,
  PiFlag,
  PiScales,
  PiLightbulb,
  PiNewspaper,
  PiFlowerLight,
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
} from 'react-icons/pi';
import { MdDiversity1 } from 'react-icons/md';
import { agentsList, type AgentListItem } from './agents';

export type MentionableType =
  | 'agent'
  | 'notebook'
  | 'tool'
  | 'document'
  | 'board'
  | 'doc'
  | 'wolke';
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
  icon?: React.ComponentType<{ className?: string }>;
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
  'gruenerator-oeffentlichkeitsarbeit-berlin': MdDiversity1,
  'gruenerator-oeffentlichkeitsarbeit-hamburg': PiCompass,
  'gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern': PiFlag,
  'gruenerator-oeffentlichkeitsarbeit-thueringen': PiTree,
  'gruenerator-oeffentlichkeitsarbeit-brandenburg': PiFlowerLight,
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

let customAgentMentionables: Mentionable[] = [];

export function setCustomAgents(agents: CustomAgentMentionable[]): void {
  customAgentMentionables = agents.map(customAgentToMentionable);
  rebuildMentionableMap();
}

export function getCustomAgentMentionables(): Mentionable[] {
  return customAgentMentionables;
}

export const notebookMentionables: Mentionable[] = [
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'gruenerator-notebook',
    title: 'Alle Quellen',
    description: 'Durchsucht mehrere Quellen parallel',
    avatar: '🔍',
    icon: PiMagnifyingGlass,
    backgroundColor: '#316049',
    mention: 'alle',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'gruene-notebook',
    title: 'Grundsatzprogramm',
    description: 'Grundsatzprogramme von Bündnis 90/Die Grünen',
    avatar: '📗',
    icon: PiBooks,
    backgroundColor: '#316049',
    mention: 'grundsatz',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'bundestagsfraktion-notebook',
    title: 'Bundestagsfraktion',
    description: 'Inhalte von gruene-bundestag.de',
    avatar: '🏛️',
    icon: PiBank,
    backgroundColor: '#316049',
    mention: 'bundestag',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'hamburg-notebook',
    title: 'Grüne Hamburg',
    description: 'Beschlüsse und Presse der Grünen Hamburg',
    avatar: '⚓',
    icon: PiCompass,
    backgroundColor: '#316049',
    mention: 'hamburg',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'schleswig-holstein-notebook',
    title: 'Grüne Schleswig-Holstein',
    description: 'Wahlprogramm Schleswig-Holstein',
    avatar: '🌊',
    icon: PiMapPin,
    backgroundColor: '#316049',
    mention: 'sh',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'thueringen-notebook',
    title: 'Grüne Thüringen',
    description: 'Beschlüsse und Wahlprogramme Thüringen',
    avatar: '🏔️',
    icon: PiTree,
    backgroundColor: '#316049',
    mention: 'thüringen',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'oesterreich-notebook',
    title: 'Grüne Österreich',
    description: 'Programme von Die Grünen Österreich',
    avatar: '🇦🇹',
    icon: PiGlobe,
    backgroundColor: '#88B04B',
    mention: 'at',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'bayern-notebook',
    title: 'Grüne Bayern',
    description: 'Regierungsprogramm Bayern',
    avatar: '🦁',
    icon: PiMapPin,
    backgroundColor: '#316049',
    mention: 'bayern',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'berlin-notebook',
    title: 'Grüne Berlin',
    description: 'Wahlprogramm 2026, Pressemitteilungen und Beschlüsse Berlin',
    avatar: '🐻',
    icon: MdDiversity1,
    backgroundColor: '#316049',
    mention: 'berlin',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'mecklenburg-vorpommern-notebook',
    title: 'Grüne Mecklenburg-Vorpommern',
    description: 'Presse und Parteitagsbeschlüsse MV',
    avatar: '🦅',
    icon: PiFlag,
    backgroundColor: '#316049',
    mention: 'mv',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'brandenburg-notebook',
    title: 'Grüne Brandenburg',
    description: 'Presse, Beschlüsse und Landtagswahlprogramm 2024 Brandenburg',
    avatar: '🦅',
    icon: PiFlowerLight,
    backgroundColor: '#316049',
    mention: 'brandenburg',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'kommunalwiki-notebook',
    title: 'KommunalWiki',
    description: 'Fachwissen zur Kommunalpolitik',
    avatar: '📚',
    icon: PiScales,
    backgroundColor: '#316049',
    mention: 'kommunalwiki',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'boell-stiftung-notebook',
    title: 'Heinrich-Böll-Stiftung',
    description: 'Analysen und Dossiers der Böll-Stiftung',
    avatar: '📖',
    icon: PiLightbulb,
    backgroundColor: '#316049',
    mention: 'böll',
  },
  {
    type: 'notebook',
    category: 'function',
    trigger: '@',
    identifier: 'gruenblog-notebook',
    title: 'Grünblog',
    description: 'Onlinemagazin der Grünen',
    avatar: '📰',
    icon: PiNewspaper,
    backgroundColor: '#316049',
    mention: 'gruenblog',
  },
];

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
          description: 'Drei Sharepic-Varianten erstellen (Dreizeiler, Zitat, Info)',
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
function toBase64Url(input: string): string {
  if (typeof globalThis.btoa === 'function') {
    return globalThis
      .btoa(unescape(encodeURIComponent(input)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return Buffer.from(input, 'utf-8')
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
  return Buffer.from(full, 'base64').toString('utf-8');
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

export function getAllMentionables(): Mentionable[] {
  return [
    ...agentMentionables,
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
} {
  const allBoards = [...boardToolMentionables, ...dynamicBoardMentionables];
  const allDocs = [...docToolMentionables, ...dynamicDocMentionables];
  if (!query) {
    return {
      agents: agentMentionables,
      customAgents: customAgentMentionables,
      notebooks: notebookMentionables,
      userNotebooks: dynamicUserNotebookMentionables,
      tools: toolMentionables,
      boards: allBoards,
      docs: allDocs,
      documents: documentMentionables,
      wolke: wolkeMentionables,
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
    agents: agentMentionables.filter(matchFn),
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
    ...all.userNotebooks,
    ...all.notebooks,
  ];
}
