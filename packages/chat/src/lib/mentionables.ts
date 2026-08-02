import { allIntentMentions, forcedToolFor } from '@gruenerator/shared/chat-intents';
import {
  PiFlask,
  PiMagnifyingGlass,
  PiFiles,
  PiNote,
  PiPaintBrush,
  PiTreeEvergreen,
  PiImage,
  PiImagesSquare,
  PiClipboardText,
  PiBank,
  PiFilePdf,
  PiFileText,
  PiSparkle,
  PiCloud,
  PiGlobe,
  PiNotePencil,
  PiPlugsConnected,
  PiChartBar,
  PiBooks,
  PiLightbulb,
  PiNewspaper,
  PiClockCounterClockwise,
  PiCloudSun,
  PiShareNetwork,
  PiChartLine,
  PiCalculator,
} from '@gruenerator/shared/icons';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import {
  NOTEBOOK_REGISTRY,
  isNotebookEnabled,
  getNotebooksForAudience,
} from '@gruenerator/shared/notebooks';
import { mcpBrandColor, slugifyName } from '@gruenerator/shared/utils';

import { agentsList, type AgentListItem, type SkillCategory } from './agents';

export type MentionableType =
  | 'agent'
  | 'textform'
  | 'notebook'
  | 'tool'
  | 'document'
  | 'board'
  | 'doc'
  | 'sheet'
  | 'presentation'
  | 'wolke'
  | 'connect'
  | 'canva'
  | 'vorlagen'
  | 'webpage';
export type MentionableCategory = 'skill' | 'function';

export interface Mentionable {
  type: MentionableType;
  category: MentionableCategory;
  /** Always '@' — the former '/' trigger for recipes was folded into it. */
  trigger: '@';
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  backgroundColor: string;
  mention: string;
  skillCategory?: SkillCategory;
  promptTemplate?: string;
  isSystemDefault?: boolean;
  iconKey?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Locale visibility (skills/agents): de-DE / de-AT / all. Undefined ≈ all. */
  audience?: 'de-DE' | 'de-AT' | 'all';
  /**
   * Name of the group a recipe was shared from. Set only on recipes that
   * reached the user through a group share — the UI lists those separately so
   * shared and own recipes never blur into each other.
   */
  sharedFromGroup?: string;
  /**
   * Extra mention strings that resolve to this same mentionable but are NOT
   * shown as separate picker entries. Used for back-compat after merging tools
   * (e.g. the merged "Recherche" tool keeps `websearch` resolving so old
   * @websearch mentions in existing threads still work).
   */
  aliases?: string[];
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
  'gruenerator-oeffentlichkeitsarbeit-saarland': NOTEBOOK_ICONS['saarland-notebook'],
};

export function agentToMentionable(agent: AgentListItem): Mentionable {
  // Per-skill `agent.icon` wins over the legacy identifier-keyed override map
  // so PM-<LV> and Social-<LV> variants can carry distinct icons even though
  // they share an agent identifier.
  const icon = agent.icon ?? AGENT_ICON_OVERRIDES[agent.identifier];
  return {
    type: 'agent',
    category: 'skill',
    trigger: '@',
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
    trigger: '@',
    identifier: agent.id,
    title: agent.name,
    description: agent.description || '',
    avatar: '🤖',
    backgroundColor: '#316049',
    mention: agent.slug,
  };
}

export const agentMentionables: Mentionable[] = agentsList.map(agentToMentionable);

/**
 * React list key for a mentionable. `identifier` alone is NOT unique: a skill's
 * identifier is its OWNING AGENT, so `gruenerator-oeffentlichkeitsarbeit` covers
 * `@presse`, `@instagram`, `@facebook` and `@twitter` alike — 18 skills share 8
 * identifiers. Keying a list by it silently drops the duplicates.
 *
 * `mention` is the unique key within skills; type and identifier are folded in so
 * the key also holds across the mixed lists (notebooks, tools, files) the picker
 * renders together.
 */
export const mentionableKey = (m: Mentionable): string => `${m.type}:${m.identifier}:${m.mention}`;

// Locale for filtering agent/skill mentionables in the picker. Set by the host
// app (mirrors `setCustomAgents`). Resolution stays locale-agnostic so existing
// @mentions in old threads still resolve regardless of the current locale.
let mentionLocale = 'de-DE';

export function setMentionLocale(locale: string): void {
  mentionLocale = locale;
}

export function getMentionLocale(): string {
  return mentionLocale;
}

/** Agent/skill mentionables visible for the current locale (de-DE/de-AT/all). */
export function getAgentMentionables(): Mentionable[] {
  return agentMentionables.filter(
    (m) => m.audience === undefined || m.audience === 'all' || m.audience === mentionLocale
  );
}

/**
 * The built-in `@tool` mentions a user in the CURRENT locale should see.
 *
 * Must stay a function. `mentionLocale` is module state that the host app sets
 * after mount (`ChatPage`, `useMentionablesSync`), so a `const` array would
 * freeze `'de-DE'` at import time — which is precisely why the raw
 * `toolMentionables` was still leaking `@bundestag` to Austrian users even
 * though the audience field was set correctly.
 *
 * `toolMentionables` stays exported unfiltered because `resolveMentionable`
 * needs it: an `@bundestag` typed in an old thread must still resolve for
 * everyone, or the message would render a broken mention. Discovery is
 * filtered; resolution is not. Same split the notebooks use.
 */
export function visibleToolMentionables(): Mentionable[] {
  return toolMentionables.filter(
    (m) => m.audience === undefined || m.audience === 'all' || m.audience === mentionLocale
  );
}

/**
 * System notebooks visible for the current locale — the same
 * `getNotebooksForAudience` the web and mobile galleries use. The chat picker
 * was the one surface that never asked, so an Austrian user was offered every
 * German Landesverband notebook.
 *
 * `notebookMentionables` (enabled-only) stays the input; `allNotebookMentionables`
 * remains what `resolveMentionable` reads, so a disabled or foreign notebook
 * mentioned in an old thread still resolves.
 */
export function visibleNotebookMentionables(): Mentionable[] {
  const locale = mentionLocale === 'de-AT' ? 'de-AT' : 'de-DE';
  const allowed = new Set<string>(getNotebooksForAudience(locale).map((n) => n.id));
  return notebookMentionables.filter((m) => allowed.has(m.identifier));
}

let customAgentMentionables: Mentionable[] = [];

export function setCustomAgents(agents: CustomAgentMentionable[]): void {
  customAgentMentionables = agents.map(customAgentToMentionable);
  rebuildMentionableMap();
}

export function getCustomAgentMentionables(): Mentionable[] {
  return customAgentMentionables;
}

// User-defined text forms ("Texte anlernen"): custom `/mention` skills whose
// learned style is injected at chat time. Type 'textform' (not 'agent') so the
// `/`-submit parser doesn't swap the agent — the style rides `activeSkillMention`
// (set by the composer on select) exactly like a system skill.
export interface TextformMentionable {
  mention: string;
  title: string;
}

export function textformToMentionable(t: TextformMentionable): Mentionable {
  return {
    type: 'textform',
    category: 'skill',
    trigger: '@',
    identifier: t.mention,
    title: t.title,
    description: 'Eigene Textform',
    avatar: '✍️',
    backgroundColor: '#316049',
    mention: t.mention,
  };
}

let textformMentionables: Mentionable[] = [];

export function setTextforms(forms: TextformMentionable[]): void {
  textformMentionables = forms.map(textformToMentionable);
  rebuildMentionableMap();
}

export function getTextformMentionables(): Mentionable[] {
  return textformMentionables;
}

// Derived from the shared notebook registry so the @-mention picker always matches the
// web/mobile galleries. Adding a notebook to `@gruenerator/shared/notebooks` surfaces it
// here automatically; the icon is resolved by id from the shared NOTEBOOK_ICONS map.
//
// Two views: `allNotebookMentionables` (incl. disabled) backs `resolveMentionable`
// so old `@hamburg`/`@sh` tokens in existing threads still resolve, while the
// exported `notebookMentionables` (enabled only) is what the picker offers — so a
// notebook turned off via `enabled: false` disappears from discovery.
const allNotebookMentionables: Mentionable[] = NOTEBOOK_REGISTRY.map((nb) => ({
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

export const notebookMentionables: Mentionable[] = allNotebookMentionables.filter((m) =>
  isNotebookEnabled(m.identifier)
);

/**
 * Icon per tool-mention slug. Icons cannot live in the registry — it is
 * framework-free so the backend and React Native can read it too — so the slug
 * is the shared key, exactly as `NOTEBOOK_ICONS` does it for notebooks.
 * Completeness is asserted at runtime in `mentionables.vitest.ts`: a registry
 * mention with no icon here fails that test instead of rendering blank.
 */
const TOOL_MENTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  recherche: PiFlask,
  deepresearch: PiMagnifyingGlass,
  dokumente: PiFiles,
  doku: PiBooks,
  umfragen: PiChartBar,
  abgeordnetenwatch: PiClipboardText,
  bundestag: PiBank,
  zusammenfassung: PiNote,
  'pdf-erstellen': PiFilePdf,
  bildgenerieren: PiPaintBrush,
  stadtbegruenen: PiTreeEvergreen,
  bildbearbeiten: PiImage,
  sharepic: PiImagesSquare,
  beispiele: PiLightbulb,
  pressemitteilungen: PiNewspaper,
  verlauf: PiClockCounterClockwise,
  wetter: PiCloudSun,
  social: PiShareNetwork,
  diagramm: PiChartLine,
  rechnen: PiCalculator,
};

/**
 * Picker order. The registry is ordered by the wire enum, which groups intents
 * by when they were added rather than by what a user reaches for — so the
 * display order lives here, carried over unchanged from the hand-written array
 * this derivation replaced. A slug missing from the list sorts to the end in
 * registry order: forgetting one is a cosmetic slip, not a disappearance.
 */
const TOOL_MENTION_ORDER: readonly string[] = [
  'recherche',
  'deepresearch',
  'dokumente',
  'doku',
  'umfragen',
  'abgeordnetenwatch',
  'bundestag',
  'zusammenfassung',
  'pdf-erstellen',
  'bildgenerieren',
  'stadtbegruenen',
  'bildbearbeiten',
  'sharepic',
  'social',
  'diagramm',
  'rechnen',
  'beispiele',
  'pressemitteilungen',
  'verlauf',
];

/**
 * The built-in `@tool` mentions, derived from the intent registry
 * (`@gruenerator/shared/chat-intents`).
 *
 * `identifier` is the string the parser puts into `forcedTools` and the backend
 * router resolves. It is NOT always the intent id — `@pdf-erstellen` forces
 * `create_pdf`, `@bildbearbeiten` forces the universal-style variant of
 * `image_edit` — which is exactly why the registry names it explicitly.
 *
 * `availability: 'web-only'` (sharepic) gates on a browser environment, NOT on
 * NODE_ENV: the canvas editor that renders and edits a sharepic has no React
 * Native runtime, but the pipeline is production-ready on web.
 */
function buildToolMentionables(): Mentionable[] {
  const rank = (slug: string) => {
    const i = TOOL_MENTION_ORDER.indexOf(slug);
    return i === -1 ? TOOL_MENTION_ORDER.length : i;
  };
  return (
    allIntentMentions()
      // A retired intent has no route left — offering it would put a token on the
      // wire the router no longer resolves. Belt and braces: retired entries drop
      // their `mention` too, so `allIntentMentions()` already skips them.
      .filter(({ intent }) => intent.availability !== 'retired')
      .filter(({ intent }) => intent.availability !== 'web-only' || typeof document !== 'undefined')
      .map(({ intent, mention }) => {
        const icon = TOOL_MENTION_ICONS[mention.slug];
        return {
          type: 'tool' as const,
          category: 'function' as const,
          trigger: '@' as const,
          identifier: mention.forcedTool ?? forcedToolFor(intent),
          title: mention.title,
          description: mention.description,
          avatar: mention.avatar,
          backgroundColor: mention.backgroundColor,
          mention: mention.slug,
          audience: intent.audience,
          ...(mention.aliases ? { aliases: [...mention.aliases] } : {}),
          ...(mention.promptTemplate ? { promptTemplate: mention.promptTemplate } : {}),
          ...(icon ? { icon } : {}),
        };
      })
      .sort((a, b) => rank(a.mention) - rank(b.mention))
  );
}

export const toolMentionables: Mentionable[] = buildToolMentionables();

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

export interface SheetMentionable {
  id: string;
  title: string;
  slug: string;
}

export const sheetToolMentionables: Mentionable[] = [
  {
    type: 'sheet',
    category: 'function',
    trigger: '@',
    identifier: 'sheet-erstellen',
    title: 'Tabelle erstellen',
    description: 'Erstellt eine Tabelle (Spreadsheet) aus dem Chatverlauf',
    avatar: '✨',
    icon: PiSparkle,
    backgroundColor: '#316049',
    mention: 'tabelle-erstellen',
  },
];

let dynamicSheetMentionables: Mentionable[] = [];

export function setSheetMentionables(sheets: SheetMentionable[]): void {
  dynamicSheetMentionables = sheets.map((sh) => ({
    type: 'sheet' as const,
    category: 'function' as const,
    trigger: '@' as const,
    identifier: sh.id,
    title: sh.title,
    description: `Tabelle: ${sh.title}`,
    avatar: '📊',
    icon: PiClipboardText,
    backgroundColor: '#316049',
    mention: sh.slug,
  }));
  rebuildMentionableMap();
}

export const presentationToolMentionables: Mentionable[] = [
  {
    type: 'presentation',
    category: 'function',
    trigger: '@',
    identifier: 'praesentation-erstellen',
    title: 'Präsentation erstellen',
    description: 'Erstellt eine Präsentation (Foliensatz) aus dem Chatverlauf',
    avatar: '🎬',
    icon: PiSparkle,
    backgroundColor: '#316049',
    mention: 'praesentation-erstellen',
  },
];

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
    // Single document entry point. Opens the unified file/doc browser
    // (notebook files, uploads, saved texts, collaborative docs). Replaces the
    // former @datei ("Datei auswählen") and @dokumentchat ("Dokument-Chat")
    // pickers — `aliases` keep those names resolving here for back-compat and
    // surface this entry when a user types the old triggers.
    type: 'doc',
    category: 'function',
    trigger: '@',
    identifier: 'docs-picker-trigger',
    title: 'Dokument einfügen',
    description: 'Dokumente, Dateien & Notizbuch-Inhalte als Kontext hinzufügen',
    avatar: '📄',
    icon: PiFileText,
    backgroundColor: '#0891B2',
    mention: 'docs',
    aliases: ['datei', 'dokumentchat', 'document', 'dokument'],
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

export interface McpServerMentionable {
  id: string;
  name: string;
  description?: string | null;
}

let dynamicMcpServerMentionables: Mentionable[] = [];

/**
 * Per-server MCP mentions (@notion, @brevo, …) — one entry per connected server,
 * fed from `/api/mcp/servers`. The identifier is `mcp:<serverId>` so the parser
 * routes it into forcedTools and the backend scopes the tool-loop to that one
 * server; the visible `@slug` is cosmetic. Replaces the old generic @mcp.
 */
export function setMcpServerMentionables(servers: McpServerMentionable[]): void {
  const usedSlugs = new Set<string>();
  // A slug that collides with a built-in/agent/notebook mention (registered
  // earlier, so first-wins in rebuildMentionableMap) would make the server
  // unreachable — its @mention would resolve to the other entry. Treat those as
  // taken too, and suffix around them.
  const takenByOther = (slug: string): boolean => {
    const existing = mentionableMap.get(slug);
    return existing != null && !existing.identifier.startsWith('mcp:');
  };
  dynamicMcpServerMentionables = servers.map((srv) => {
    let slug = slugifyName(srv.name, 'mcp');
    if (usedSlugs.has(slug) || takenByOther(slug)) {
      let n = 2;
      while (usedSlugs.has(`${slug}-${n}`) || takenByOther(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    usedSlugs.add(slug);
    return {
      type: 'tool' as const,
      category: 'function' as const,
      trigger: '@' as const,
      identifier: `mcp:${srv.id}`,
      title: srv.name,
      description: srv.description || 'Verbundener MCP-Dienst',
      avatar: '🔌',
      icon: PiPlugsConnected,
      backgroundColor: mcpBrandColor(srv.name),
      mention: slug,
    };
  });
  rebuildMentionableMap();
}

export function getMcpServerMentionables(): Mentionable[] {
  return dynamicMcpServerMentionables;
}

/**
 * The legacy @datei ("Datei auswählen") and @dokumentchat ("Dokument-Chat")
 * pickers were merged into the single @docs entry below — it opens the same
 * unified file/doc browser (notebook files, uploads, saved texts, collab docs).
 * This list stays empty (no separate picker entry); @datei / @dokumentchat
 * tokens in existing threads still resolve via `mentionParser` special-cases
 * and the `aliases` on the @docs mentionable.
 */
export const documentMentionables: Mentionable[] = [];

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

// @web opens a sub-popover for pasting a URL. The page is attached as a chip
// (contentType application/x-gruenerator-webpage) whose data carries the URL;
// the backend crawls it through the existing scrape_url pipeline.
export const webpageMentionables: Mentionable[] = [
  {
    type: 'webpage',
    category: 'function',
    trigger: '@',
    identifier: 'webpage-trigger',
    title: 'Webseite',
    description: 'Inhalt einer Webseite per URL anhängen',
    avatar: '🌐',
    icon: PiGlobe,
    backgroundColor: '#0EA5E9',
    mention: 'web',
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

/**
 * Everything the current user could pick, locale-filtered like the picker.
 * Resolution of an existing mention does NOT go through here — that is
 * `resolveMentionable`, which stays locale-agnostic on purpose.
 */
export function getAllMentionables(): Mentionable[] {
  return [
    ...getAgentMentionables(),
    ...customAgentMentionables,
    ...textformMentionables,
    ...dynamicUserNotebookMentionables,
    ...visibleNotebookMentionables(),
    ...visibleToolMentionables(),
    ...dynamicMcpServerMentionables,
    ...boardToolMentionables,
    ...dynamicBoardMentionables,
    ...docToolMentionables,
    ...dynamicDocMentionables,
    ...sheetToolMentionables,
    ...dynamicSheetMentionables,
    ...presentationToolMentionables,
    ...documentMentionables,
    ...wolkeMentionables,
    ...connectMentionables,
    ...canvaMentionables,
    ...vorlagenMentionables,
    ...webpageMentionables,
  ];
}

const mentionableMap = new Map<string, Mentionable>();

function rebuildMentionableMap(): void {
  mentionableMap.clear();
  const orderedSources = [
    agentMentionables,
    customAgentMentionables,
    textformMentionables,
    dynamicUserNotebookMentionables,
    // Full set (incl. disabled) so historical `@hamburg`/`@sh` tokens still resolve.
    allNotebookMentionables,
    toolMentionables,
    dynamicMcpServerMentionables,
    boardToolMentionables,
    dynamicBoardMentionables,
    docToolMentionables,
    dynamicDocMentionables,
    sheetToolMentionables,
    dynamicSheetMentionables,
    presentationToolMentionables,
    documentMentionables,
    wolkeMentionables,
    connectMentionables,
    canvaMentionables,
    vorlagenMentionables,
    webpageMentionables,
  ];
  for (const source of orderedSources) {
    for (const m of source) {
      const key = m.mention.toLowerCase();
      if (!mentionableMap.has(key)) {
        mentionableMap.set(key, m);
      }
      // Back-compat aliases resolve to the same mentionable (not shown in the
      // picker). Same first-wins dedup as the primary mention.
      for (const alias of m.aliases ?? []) {
        const aliasKey = alias.toLowerCase();
        if (!mentionableMap.has(aliasKey)) {
          mentionableMap.set(aliasKey, m);
        }
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
  const allDocs = [
    ...docToolMentionables,
    ...dynamicDocMentionables,
    ...sheetToolMentionables,
    ...dynamicSheetMentionables,
    ...presentationToolMentionables,
  ];
  if (!query) {
    return {
      agents: getAgentMentionables(),
      customAgents: [...customAgentMentionables, ...textformMentionables],
      notebooks: visibleNotebookMentionables(),
      userNotebooks: dynamicUserNotebookMentionables,
      tools: [
        ...visibleToolMentionables(),
        ...dynamicMcpServerMentionables,
        ...webpageMentionables,
      ],
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
    m.identifier.toLowerCase().includes(q) ||
    // Back-compat aliases (e.g. typing @datei / @dokumentchat surfaces @docs).
    (m.aliases?.some((a) => a.toLowerCase().includes(q)) ?? false);

  const isNotebookCategoryQuery =
    'notebook'.startsWith(q) ||
    q.startsWith('notebook') ||
    'notizbuch'.startsWith(q) ||
    q.startsWith('notizbuch') ||
    'notiz'.startsWith(q) ||
    q.startsWith('notiz');

  return {
    agents: getAgentMentionables().filter(matchFn),
    customAgents: [...customAgentMentionables, ...textformMentionables].filter(matchFn),
    notebooks: isNotebookCategoryQuery
      ? visibleNotebookMentionables()
      : visibleNotebookMentionables().filter(matchFn),
    userNotebooks: isNotebookCategoryQuery
      ? dynamicUserNotebookMentionables
      : dynamicUserNotebookMentionables.filter(matchFn),
    tools: [
      ...visibleToolMentionables(),
      ...dynamicMcpServerMentionables,
      ...webpageMentionables,
    ].filter(matchFn),
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
