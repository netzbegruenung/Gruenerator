import {
  isAdminVisibleSkill,
  isLvItemVisibleForRoles,
  isLvNotebookVisibleForRoles,
  isSkillOfferedIn,
} from '@gruenerator/shared/agents';
import {
  allIntentMentions,
  ARTIFACT_CREATE_TOKENS,
  forcedToolFor,
} from '@gruenerator/shared/chat-intents';
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
  PiLink,
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
  isNotebookOfferedIn,
  getNotebooksForAudience,
} from '@gruenerator/shared/notebooks';
import { mcpBrandColor, slugifyName } from '@gruenerator/shared/utils';

import { agentsList, type AgentListItem, type SkillCategory } from './agents';
import { getMentionInstance } from './instanceState';

export type MentionableType =
  | 'agent'
  | 'useragent'
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
   * Instances offering this recipe. Undefined ≈ all of them — evaluated by
   * `isSkillOfferedIn`, see `shared/src/agents/skillInstances.ts`.
   */
  instances?: readonly string[];
  /**
   * Name of the group a recipe was shared from. Set only on recipes that
   * reached the user through a group share — the UI lists those separately so
   * shared and own recipes never blur into each other.
   */
  sharedFromGroup?: string;
  /**
   * Set on a recipe the user saved from someone else's public prompt: the
   * owner's display name, or `null` when the profile join found none. The KEY's
   * presence is the marker, not its value — `undefined` means "the user's own".
   *
   * A second origin beside `sharedFromGroup` rather than a reuse of it: a saved
   * prompt comes from a person, not from a group, and claiming a group would be
   * as wrong as the "eigene" it used to claim (#2876).
   */
  savedFromOwner?: string | null;
  /**
   * Extra mention strings that resolve to this same mentionable but are NOT
   * shown as separate picker entries. Used for back-compat after merging tools
   * (e.g. the merged "Recherche" tool keeps `websearch` resolving so old
   * @websearch mentions in existing threads still work).
   */
  aliases?: string[];
  /**
   * The originating intent's registry category (`'generation'`, `'retrieval'`,
   * …), carried over on `type: 'tool'` entries only.
   *
   * Exists so the plus menu can ask the registry which entries are "make me
   * something" rather than keeping a second hand-written slug list beside
   * `TOOL_MENTION_ORDER` — two lists that would drift the first time an intent
   * is added. Not a display field; `MentionableCategory` above is the unrelated
   * skill/function split and keeps its name.
   */
  intentCategory?: string;
}

/**
 * A user-authored or saved custom prompt. No `sharedFromGroup`: `custom_prompts`
 * / `saved_prompts` know a public directory and a bookmark, not group shares —
 * the wire (`customPromptSchema`) carries no group name at all. Group shares for
 * agents live in the separate `user_agents` table and arrive through
 * `UserAgentMentionable` below, which is where that origin comes from (#2909).
 *
 * What the wire DOES carry is the owner of a saved prompt, so `savedFromOwner`
 * marks the ones that are not the user's own. Set by `syncCustomAgents` from
 * which endpoint an entry came, `undefined` for the user's own.
 */
export interface CustomAgentMentionable {
  id: string;
  name: string;
  slug: string;
  description?: string;
  savedFromOwner?: string | null;
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
    ...(agent.instances ? { instances: agent.instances } : {}),
    ...(icon ? { icon } : {}),
  };
}

export function customAgentToMentionable(agent: CustomAgentMentionable): Mentionable {
  const saved = agent.savedFromOwner !== undefined;
  const fallbackDescription = saved
    ? agent.savedFromOwner
      ? `Rezept von ${agent.savedFromOwner}`
      : 'Gespeichertes Rezept'
    : '';
  return {
    type: 'agent',
    category: 'skill',
    trigger: '@',
    identifier: agent.id,
    title: agent.name,
    description: agent.description || fallbackDescription,
    avatar: '🤖',
    backgroundColor: '#316049',
    mention: agent.slug,
    ...(saved ? { savedFromOwner: agent.savedFromOwner ?? null } : {}),
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

// Which instance the host app runs as — decides which notebooks and recipes the
// picker offers. Lives in `instanceState.ts` (see the note there on why it is
// not in this file) and is re-exported here, where every caller already looks
// for it.
export { getMentionInstance, setMentionInstance } from './instanceState';

// Rezept `mention`s an admin hid from discovery on this deployment
// (admin_hidden_skills). Set by `useHiddenSkillMentions` — same pattern as
// `mentionLocale`/`mentionInstance` above. Discovery only: `resolveMentionable`
// stays unfiltered so an existing @mention/link keeps resolving.
let hiddenSkillMentions: readonly string[] = [];

export function setHiddenSkillMentions(mentions: readonly string[]): void {
  hiddenSkillMentions = mentions;
}

// Die Landesverbände der angemeldeten Person, abgeleitet aus ihren Profilrollen
// (`useUserLandesverbaende`). Gesetzt vom Host wie `mentionLocale` darüber, weil
// dieses Paket sowohl im Web-Bundle als auch in der Mobile-Binary steckt und
// keins von beiden einen gemeinsamen Weg zum Profil hat.
//
// `null` heißt „noch nicht bekannt" und damit: nicht filtern. `[]` heißt
// „geprüft, keine Landesgeschäftsstellen-Rolle" und blendet die LV-Rezepte aus.
// Deshalb ist der Vorgabewert `null` und nicht `[]` — ein Host, der den Setter
// nie ruft (Mobile), verhält sich wie bisher, statt allen alles wegzunehmen.
let mentionLandesverbaende: readonly string[] | null = null;

export function setMentionLandesverbaende(lvIds: readonly string[] | null): void {
  mentionLandesverbaende = lvIds;
}

/**
 * Agent/skill mentionables visible for the current locale, minus admin-hidden
 * Rezepte and minus what this instance does not offer.
 *
 * Two different questions, both answered here: `isAdminVisibleSkill` is the
 * per-deployment override an admin toggles at runtime, `isSkillOfferedIn` is
 * what the instance carries by construction. Discovery only — `resolveMentionable`
 * stays unfiltered so an existing @mention keeps resolving.
 */
export function getAgentMentionables(): Mentionable[] {
  return agentMentionables.filter(
    (m) =>
      (m.audience === undefined || m.audience === 'all' || m.audience === mentionLocale) &&
      isAdminVisibleSkill(m.mention, hiddenSkillMentions) &&
      isSkillOfferedIn(m, getMentionInstance()) &&
      isLvItemVisibleForRoles(m.identifier, mentionLandesverbaende)
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
 *
 * The instance filter sits here for the same reason: the picker is discovery, so
 * a notebook this instance does not offer must not be listed — while a token for
 * it in an existing thread keeps resolving, which is what makes `hidden`
 * different from `blocked`.
 */
export function visibleNotebookMentionables(): Mentionable[] {
  const locale = mentionLocale === 'de-AT' ? 'de-AT' : 'de-DE';
  const allowed = new Set<string>(getNotebooksForAudience(locale).map((n) => n.id));
  return notebookMentionables.filter(
    (m) =>
      allowed.has(m.identifier) &&
      isNotebookOfferedIn(m.identifier, getMentionInstance()) &&
      isLvNotebookVisibleForRoles(m.identifier, mentionLandesverbaende)
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

// User-defined text forms ("Texte anlernen"): custom `/mention` skills whose
// learned style is injected at chat time. Type 'textform' (not 'agent') so the
// `/`-submit parser doesn't swap the agent — the style rides `activeSkillMention`
// (set by the composer on select) exactly like a system skill.
export interface TextformMentionable {
  mention: string;
  title: string;
  /**
   * Name of the group this recipe was shared from, `null` for the user's own.
   * The picker splits the recipe section on it, so dropping it here makes a
   * colleague's recipe look like one of your own (#2876).
   */
  sharedFromGroup?: string | null;
}

export function textformToMentionable(t: TextformMentionable): Mentionable {
  return {
    type: 'textform',
    category: 'skill',
    trigger: '@',
    identifier: t.mention,
    title: t.title,
    description: t.sharedFromGroup ? `Rezept aus ${t.sharedFromGroup}` : 'Eigene Textform',
    avatar: '✍️',
    backgroundColor: '#316049',
    mention: t.mention,
    ...(t.sharedFromGroup ? { sharedFromGroup: t.sharedFromGroup } : {}),
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

/**
 * A Grünerator-Agent from the `user_agents` table — the caller's own, or one
 * shared into a group they belong to.
 *
 * Its own type rather than a reuse of `CustomAgentMentionable`, because the two
 * route differently: a custom prompt is a RECIPE (it rides `activeSkillMention`
 * as a per-turn prompt fragment), while a Grünerator REPLACES the acting agent.
 * Writing its identifier into `activeSkillMention` would make the backend look
 * up a recipe by that name and announce a text form nobody chose.
 *
 * `mention` IS the identifier: `user_agents.identifier` is already a slug and
 * is the key `getAgentForUser` resolves against, so deriving a second string
 * here would just be a second spelling that can drift.
 */
export interface UserAgentMentionable {
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  iconKey?: string;
  backgroundColor: string;
  /**
   * Name of the group this agent was shared from, `null` for the user's own.
   * The picker splits the recipe section on it — a teammate's Grünerator listed
   * as one of your own is what #2876/#2909 were about.
   */
  sharedFromGroup?: string | null;
}

export function userAgentToMentionable(a: UserAgentMentionable): Mentionable {
  return {
    type: 'useragent',
    // 'function', not 'skill': the composer activates a per-turn recipe for
    // every 'skill' it inserts, and a Grünerator is not one (see above). The
    // empty promptTemplate keeps the insertion identical to a skill's.
    category: 'function',
    trigger: '@',
    identifier: a.identifier,
    title: a.title,
    description: a.sharedFromGroup ? `Grünerator aus ${a.sharedFromGroup}` : a.description,
    avatar: a.avatar,
    backgroundColor: a.backgroundColor,
    mention: a.identifier,
    promptTemplate: '',
    // `iconKey` only, no resolved component: this module is shared with the
    // mobile bundle, and the Phosphor resolver pulls a web-only icon pack into
    // its graph. The web popover resolves the key where it renders.
    ...(a.iconKey ? { iconKey: a.iconKey } : {}),
    ...(a.sharedFromGroup ? { sharedFromGroup: a.sharedFromGroup } : {}),
  };
}

let userAgentMentionables: Mentionable[] = [];

export function setUserAgentMentionables(agents: UserAgentMentionable[]): void {
  userAgentMentionables = agents.map(userAgentToMentionable);
  rebuildMentionableMap();
}

export function getUserAgentMentionables(): Mentionable[] {
  return userAgentMentionables;
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
      // A retired intent has no route left — offering it would put a token on
      // the wire the router no longer resolves. Unless the mention pins
      // something ELSE than the verdict: a loop tool (`pinsTool`) or a recipe
      // (`activatesSkill`). Dann löst der Token weiterhin auf, er erreicht nur
      // kein Verdikt mehr. `@umfragen` ist der eine Fall,
      // `@pressemitteilungen` der andere — beide Male starb der Intent, nicht
      // die Fähigkeit.
      .filter(
        ({ intent, mention }) =>
          intent.availability !== 'retired' ||
          mention.pinsTool != null ||
          mention.activatesSkill != null
      )
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
          intentCategory: intent.category,
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

/**
 * Die vier `@…-erstellen`-Einträge sind statisch (sie kommen NICHT über
 * `allIntentMentions()`), tragen aber F0-Token: der `identifier` ist der String,
 * den der Parser in `forcedTools` legt und die Erstell-Route auflöst. Er kommt
 * deshalb aus `ARTIFACT_CREATE_TOKENS` — siehe dort, warum die Menge nur einen
 * Schreiber haben darf. `mention` (der getippte Slug) ist davon unabhängig und
 * darf abweichen: `@tabelle-erstellen` löst `sheet-erstellen` aus.
 */
export const boardToolMentionables: Mentionable[] = [
  {
    type: 'board',
    category: 'function',
    trigger: '@',
    identifier: ARTIFACT_CREATE_TOKENS.board,
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
    identifier: ARTIFACT_CREATE_TOKENS.sheet,
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
    identifier: ARTIFACT_CREATE_TOKENS.presentation,
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
    identifier: ARTIFACT_CREATE_TOKENS.document,
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

// @link opens a sub-popover for pasting a URL. The page is attached as a chip
// (contentType application/x-gruenerator-webpage) whose data carries the URL;
// the backend crawls it through the existing scrape_url pipeline.
//
// Attaching is the EXPLICIT path; it is not the only one. A URL typed straight
// into the message is auto-detected by the classifier (`extractUrls`) and lands
// on the same scrape_url pipeline, so @link is a convenience, never a
// precondition. The trigger reads `link` rather than `web` because `@web` was
// read as "search the web" — the one thing this attachment does not do.
// `type`/`identifier` stay `webpage*`: they key the attachment contentType and
// the popover branch, and are not user-facing.
export const webpageMentionables: Mentionable[] = [
  {
    type: 'webpage',
    category: 'function',
    trigger: '@',
    identifier: 'webpage-trigger',
    title: 'Link',
    description: 'Inhalt einer Webseite per URL anhängen',
    avatar: '🔗',
    icon: PiLink,
    backgroundColor: '#0EA5E9',
    mention: 'link',
    // `@web` keeps working — muscle memory, and the old name shipped. Declared
    // rather than left to chance: `matchFn` also searches `identifier`, so
    // "web" matched via `webpage-trigger` by accident, and the day that
    // identifier is renamed the alias would vanish without a test noticing.
    aliases: ['web', 'webseite', 'url'],
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
    ...userAgentMentionables,
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
    userAgentMentionables,
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
      customAgents: [...userAgentMentionables, ...customAgentMentionables, ...textformMentionables],
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
    customAgents: [
      ...userAgentMentionables,
      ...customAgentMentionables,
      ...textformMentionables,
    ].filter(matchFn),
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
