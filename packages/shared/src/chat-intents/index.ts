/**
 * Single source of truth for what a **chat intent IS** — across frontend and
 * backend.
 *
 * `searchIntentSchema` in `@gruenerator/contracts` stays the root: it is the
 * wire contract, the docs generator reads it as a `z.enum([...])` literal, and
 * six runtime loops narrow through its `.options`. This registry does not
 * replace it; it is keyed BY it (`Record<ChatIntentId, ChatIntentDefinition>`),
 * so adding an intent to the enum fails the build here until it is described.
 *
 * **Why here and not in `@gruenerator/contracts`:** the contracts package is
 * intentionally dependency-light. `packages/shared/src/agents/userTools.ts`
 * documents the same trade-off for the `enabledTools` catalog — the closed set
 * lives in shared because contracts cannot carry it. Same reasoning, same home.
 * `shared` already depends on contracts and is consumed by api, chat, web and
 * mobile alike.
 *
 * **No icons here.** Web/chat use `react-icons` component types, mobile uses
 * Ionicons names, and React Native cannot render react-icons SVGs. The intent
 * `id` is the shared key and each platform keeps its own
 * `Record<ChatIntentId, …>` icon map — which, being a total Record, fails to
 * compile when an intent is added without one. Same pattern as
 * `@gruenerator/shared/notebook-icons`.
 */

import { searchIntentSchema, type SearchIntent } from '@gruenerator/contracts';

/** An intent id. Alias of the wire enum — the enum stays the root. */
export type ChatIntentId = SearchIntent;

/**
 * Locale visibility. `'all'` means the intent runs for both audiences — which
 * is NOT the same as "identical in both": an `'all'` intent that reads a
 * different source per locale sets `localeSourced` as well.
 */
export type IntentAudience = 'de-DE' | 'de-AT' | 'all';

/**
 * Whether the capability is always there, or gated on something the picker
 * cannot assume. `'web-only'` has no React Native runtime; `'dev-only'` is
 * hidden in production builds.
 *
 * `'retired'` is different in kind: the capability still EXISTS, it is simply no
 * longer reached through an intent. Nothing produces the verdict, nothing routes
 * it, and no picker offers it — but the enum value has to stay, because
 * `searchIntentSchema` is a wire contract that shipped clients parse (and this
 * registry is a TOTAL `Record<SearchIntent, …>`, so an entry cannot be deleted
 * without deleting the enum value first). Retired entries are the difference
 * between "we removed a feature" and "we moved it somewhere better".
 */
export type IntentAvailability = 'always' | 'system-mcp' | 'web-only' | 'dev-only' | 'retired';

/**
 * How an `@mention` for this intent reaches the backend. The visible slug is
 * cosmetic; `forcedTool` is the string the parser puts on the wire and the
 * router resolves.
 */
export interface IntentMention {
  /** Typed after `@`. */
  slug: string;
  /** Extra strings that resolve here but are not offered as picker entries. */
  aliases?: readonly string[];
  title: string;
  description: string;
  /** Emoji fallback for surfaces without the icon map. */
  avatar: string;
  backgroundColor: string;
  /** Prefilled composer text when picked. */
  promptTemplate?: string;
  /**
   * The `forcedTools` string this mention emits. Defaults to the intent id;
   * differs where history left a pseudo-identifier (`pdf-erstellen` for
   * `create_pdf`).
   */
  forcedTool?: string;
}

interface IntentBase {
  id: ChatIntentId;
  audience: IntentAudience;
  /**
   * Where a locale-mismatched turn goes instead. Only meaningful when
   * `audience` is not `'all'`; the target must itself be `'all'`.
   */
  degradeTo?: ChatIntentId;
  /**
   * One honest line for the case where the user FORCED this intent (an old
   * thread's `@bundestag`, say) and we cannot serve it. Prevents an empty
   * result masquerading as an answer.
   */
  declineNote?: string;
  /**
   * Runs for both audiences but reads a DIFFERENT source per locale. A promise,
   * not a behaviour: the executor for this intent must take `userLocale`.
   */
  localeSourced?: boolean;
  /** Defaults to `'always'`. */
  availability?: IntentAvailability;
}

/** Categories that can carry an `@mention`. */
interface Mentionable {
  mention?: IntentMention;
  /**
   * Further mentions resolving to this SAME intent with a different
   * `forcedTool`, which the backend reads as a style/variant switch. Not
   * intents of their own — `@bildbearbeiten` and `@stadtbegruenen` both produce
   * `image_edit`, they only differ in which edit prompt gets built.
   */
  variantMentions?: readonly IntentMention[];
}

/**
 * Fetches something and grounds the answer in it. Carries `uiTool` when a
 * retrieval turn renders a tool card.
 */
export interface RetrievalIntent extends IntentBase, Mentionable {
  category: 'retrieval';
  /** UI tool name for the live card AND the persisted one, when they agree. */
  uiTool?: string;
  /** Set only when the persisted name differs from the live one. */
  persistTool?: string;
}

/** Produces a rendered artefact in the turn (image, sharepic, chart). */
export interface GenerationIntent extends IntentBase, Mentionable {
  category: 'generation';
  persistTool?: string;
}

/** Creates a persisted, openable document. */
export interface ArtifactIntent extends IntentBase, Mentionable {
  category: 'artifact';
  /**
   * The `forcedTools` string its create-route dispatches on — a historical
   * pseudo-id rather than the intent name, which is exactly why it must be
   * written down. `null` means the intent has no create-route entry and is
   * reached only by classification (`create_recurring_task`).
   */
  forcedTool: string | null;
  /** Compound turns let the agentic loop call the fat tool instead. */
  skipOnAgentic: boolean;
}

/**
 * Acts on an already-open document or board. Deliberately has NO mention
 * field: the target comes from the open surface, so there is nothing an
 * `@mention` in a fresh thread could refer to.
 */
export interface SurfaceEditIntent extends IntentBase {
  category: 'surface-edit';
}

/** Transforms material already in the turn rather than fetching or creating. */
export interface ProcessingIntent extends IntentBase, Mentionable {
  category: 'processing';
}

/** Classifier-internal states. Never user-selectable, never documented. */
export interface InternalIntent extends IntentBase {
  category: 'internal';
}

export type ChatIntentDefinition =
  | RetrievalIntent
  | GenerationIntent
  | ArtifactIntent
  | SurfaceEditIntent
  | ProcessingIntent
  | InternalIntent;

// Source-specific, because "nur für Deutschland" says nothing useful: a user
// deserves to know WHICH register does not cover their country.
const DECLINE_ABGEORDNETENWATCH =
  'Abgeordnetenwatch erfasst nur deutsche Parlamente (Bundestag/Landtage). ' +
  'Für den österreichischen Nationalrat liegen hier keine Daten vor.';
const DECLINE_BUNDESTAG =
  'Das DIP erfasst nur den Deutschen Bundestag und Bundesrat. ' +
  'Für den österreichischen Nationalrat liegen hier keine Daten vor.';

/**
 * Every intent, exactly once. `Record<ChatIntentId, …>` is what makes this
 * total: a new member of `searchIntentSchema` breaks the build here until it is
 * categorised and given an audience.
 */
export const CHAT_INTENTS: Record<ChatIntentId, ChatIntentDefinition> = {
  // ── retrieval ────────────────────────────────────────────────────────────
  research: {
    id: 'research',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    uiTool: 'web_search',
    mention: {
      slug: 'recherche',
      aliases: ['websearch'],
      title: 'Recherche',
      description: 'Web & Quellen – automatische Suchtiefe',
      avatar: '🔬',
      backgroundColor: '#7C3AED',
    },
    // @deepresearch is a VARIANT, not an intent of its own: same class of work,
    // same routing, only the engine and the output shape differ. It must be
    // asked for by name and is capped per day, because both engines behind it
    // are expensive: the research agent (`deepAgentTurn`, runs for minutes and
    // files a document) when `DEEP_AGENT_RESEARCH_ENABLED` is on, otherwise —
    // and whenever a run yields nothing — Linkup's `sourcedAnswer` endpoint
    // (`deepResearchTurn`). Both meter through `DeepResearchCounter`. Without
    // this mention no path reaches either, not even the agentic loop: there is
    // no tool for it.
    variantMentions: [
      {
        slug: 'deepresearch',
        aliases: ['tiefenrecherche', 'dossier'],
        title: 'Tiefenrecherche',
        description: 'Gründliche Recherche mit Quellen — als Bericht, wenige pro Tag',
        avatar: '🔭',
        backgroundColor: '#7C3AED',
        forcedTool: 'deepresearch',
      },
    ],
  },
  compare: { id: 'compare', category: 'retrieval', audience: 'all', localeSourced: true },
  search: {
    id: 'search',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    uiTool: 'gruenerator_search',
    mention: {
      slug: 'dokumente',
      title: 'Dokumente',
      description: 'Parteiprogramme & Beschlüsse durchsuchen',
      avatar: '📄',
      backgroundColor: '#316049',
    },
  },
  web: {
    id: 'web',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    uiTool: 'web_search',
  },
  scrape_url: {
    id: 'scrape_url',
    category: 'retrieval',
    audience: 'all',
    persistTool: 'scrape_url',
  },
  examples: {
    id: 'examples',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    uiTool: 'gruenerator_examples_search',
    mention: {
      slug: 'beispiele',
      title: 'Beispiele',
      description: 'Echte Social-Media-Posts als Vorlage und Inspiration',
      avatar: '💡',
      backgroundColor: '#D97706',
    },
  },
  pressemitteilung_examples: {
    id: 'pressemitteilung_examples',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    uiTool: 'gruenerator_pressemitteilung_examples',
    mention: {
      slug: 'pressemitteilungen',
      aliases: ['pm'],
      title: 'Pressemitteilungen',
      description: 'Echte PMs der Landesverbände als Vorlage',
      avatar: '📰',
      backgroundColor: '#4B5563',
    },
  },
  abgeordnetenwatch: {
    id: 'abgeordnetenwatch',
    category: 'retrieval',
    audience: 'de-DE',
    degradeTo: 'web',
    declineNote: DECLINE_ABGEORDNETENWATCH,
    mention: {
      slug: 'abgeordnetenwatch',
      title: 'Abgeordnetenwatch',
      description: 'Abstimmungen & Nebentätigkeiten von Abgeordneten',
      avatar: '🗳️',
      backgroundColor: '#4B5563',
    },
  },
  bundestag: {
    id: 'bundestag',
    category: 'retrieval',
    audience: 'de-DE',
    degradeTo: 'web',
    declineNote: DECLINE_BUNDESTAG,
    uiTool: 'bundestag',
    mention: {
      slug: 'bundestag',
      title: 'Bundestag',
      description: 'Drucksachen, Reden & Gesetzgebung aus dem Bundestag',
      avatar: '🏛️',
      backgroundColor: '#4B5563',
    },
  },
  // ── Retired: moved to the managed-connector path ─────────────────────────
  //
  // These five reached the chat as INTENTS: a verdict picked one, and the loop
  // mounted the sources behind it. They are first-party MANAGED CONNECTORS now
  // (`apps/api/services/mcp/systemMcpServers.ts`) — listed in Einstellungen →
  // Verbindungen, on by default, selected by vocabulary
  // (`managedSourceTrigger.ts`) or by an `@mention`, and mountable several at a
  // time. That last part is why they left: `reise` existed only because an
  // intent is single-valued and "Zug und Hotel" needs two.
  //
  // The entries stay because this registry is a total `Record<SearchIntent, …>`
  // and those enum values are F0 — mobile binaries in the field parse them. They
  // describe capabilities the product still has, reached another way; deleting
  // them would need the enum values gone first, which cannot happen.
  bahn: {
    id: 'bahn',
    category: 'retrieval',
    audience: 'de-DE',
    availability: 'retired',
  },
  reise: {
    id: 'reise',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    availability: 'retired',
  },
  hotel: {
    id: 'hotel',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    availability: 'retired',
  },
  wetter: {
    id: 'wetter',
    category: 'retrieval',
    audience: 'all',
    availability: 'retired',
  },
  news: {
    id: 'news',
    category: 'retrieval',
    audience: 'de-DE',
    availability: 'retired',
  },
  // PolitPro covers the Nationalrat and all nine Austrian Länder as fully as
  // the German parliaments — hence `'all'` plus `localeSourced`.
  umfragen: {
    id: 'umfragen',
    category: 'retrieval',
    audience: 'all',
    localeSourced: true,
    mention: {
      slug: 'umfragen',
      title: 'Umfragen',
      description: 'Meinungsumfragen & Sonntagsfrage durchsuchen',
      avatar: '📊',
      backgroundColor: '#F59E0B',
      promptTemplate: 'Suche aktuelle Umfragen zu ',
    },
  },
  // Describes the PRODUCT, which is the same in both countries.
  hilfe: {
    id: 'hilfe',
    category: 'retrieval',
    audience: 'all',
    mention: {
      slug: 'doku',
      aliases: ['hilfe', 'anleitung'],
      title: 'Hilfe & Anleitungen',
      description: 'Anleitungen zum Grünerator aus der Doku',
      avatar: '📖',
      backgroundColor: '#0891B2',
    },
  },
  chat_history: {
    id: 'chat_history',
    category: 'retrieval',
    audience: 'all',
    uiTool: 'search_chat_history',
    mention: {
      slug: 'verlauf',
      aliases: ['chatverlauf'],
      title: 'Chatverlauf',
      description: 'Frühere Chats nach Inhalten durchsuchen',
      avatar: '🕘',
      backgroundColor: '#4B5563',
    },
  },
  mcp: { id: 'mcp', category: 'retrieval', audience: 'all' },

  // ── generation ───────────────────────────────────────────────────────────
  image: {
    id: 'image',
    category: 'generation',
    audience: 'all',
    persistTool: 'image_generate',
    mention: {
      slug: 'bildgenerieren',
      title: 'Bildgenerierung',
      description: 'Bild mit KI generieren (Flux)',
      avatar: '🎨',
      backgroundColor: '#D97706',
    },
  },
  // Two mentions point here: @stadtbegruenen (green-urban branding, the slug
  // below) and @bildbearbeiten, which forces the same intent with the universal
  // edit style via the `image_edit_universal` forcedTool. The style variant is a
  // property of this intent, not an intent of its own.
  image_edit: {
    id: 'image_edit',
    category: 'generation',
    audience: 'all',
    persistTool: 'image_edit',
    mention: {
      slug: 'stadtbegruenen',
      title: 'Stadt begrünen',
      description: 'Stadtbild mit Grün transformieren',
      avatar: '🌳',
      backgroundColor: '#059669',
    },
    variantMentions: [
      {
        slug: 'bildbearbeiten',
        title: 'Bild bearbeiten',
        description: 'Angehängtes Bild frei bearbeiten (z.B. "jünger machen", "mehr Grün")',
        avatar: '🖼️',
        backgroundColor: '#059669',
        forcedTool: 'image_edit_universal',
      },
    ],
  },
  sharepic: {
    id: 'sharepic',
    category: 'generation',
    audience: 'all',
    localeSourced: true,
    persistTool: 'sharepic',
    availability: 'web-only',
    mention: {
      slug: 'sharepic',
      title: 'Sharepic',
      description:
        'Sharepic-Varianten erstellen und per Chat bearbeiten (Text, Bild, Farben, Position)',
      avatar: '🖼️',
      backgroundColor: '#46962b',
    },
  },
  social_post: {
    id: 'social_post',
    category: 'generation',
    audience: 'all',
    localeSourced: true,
    persistTool: 'social_post',
    mention: {
      slug: 'social',
      aliases: ['socialpost'],
      title: 'Social Post',
      description: 'Post-Text mit passendem Sharepic in einem Zug',
      avatar: '📣',
      backgroundColor: '#7C3AED',
    },
  },
  chart: {
    id: 'chart',
    category: 'generation',
    audience: 'all',
    mention: {
      slug: 'diagramm',
      aliases: ['chart'],
      title: 'Diagramm',
      description: 'Zahlen als Diagramm darstellen',
      avatar: '📈',
      backgroundColor: '#0891B2',
    },
  },
  artifact: { id: 'artifact', category: 'generation', audience: 'all' },

  // ── artifact ─────────────────────────────────────────────────────────────
  save_as_doc: {
    id: 'save_as_doc',
    category: 'artifact',
    audience: 'all',
    forcedTool: 'dokument-erstellen',
    skipOnAgentic: false,
  },
  create_sheet: {
    id: 'create_sheet',
    category: 'artifact',
    audience: 'all',
    forcedTool: 'sheet-erstellen',
    skipOnAgentic: true,
  },
  create_presentation: {
    id: 'create_presentation',
    category: 'artifact',
    audience: 'all',
    localeSourced: true,
    forcedTool: 'praesentation-erstellen',
    skipOnAgentic: true,
  },
  create_pdf: {
    id: 'create_pdf',
    category: 'artifact',
    audience: 'all',
    localeSourced: true,
    forcedTool: 'pdf-erstellen',
    skipOnAgentic: true,
    mention: {
      slug: 'pdf-erstellen',
      aliases: ['pdf', 'formular', 'briefkopf'],
      title: 'PDF erstellen',
      description:
        'Erstellt ein barrierefreies PDF (PDF/UA-1) — Dokument, Brief mit Briefkopf oder ausfüllbares Formular',
      avatar: '📄',
      backgroundColor: '#316049',
      forcedTool: 'pdf-erstellen',
    },
  },
  // EXPERIMENTAL. Unlike its four siblings it has no `createRoutes` entry and no
  // mention — the router reaches it through a dedicated intent branch only.
  create_recurring_task: {
    id: 'create_recurring_task',
    category: 'artifact',
    audience: 'all',
    forcedTool: null,
    skipOnAgentic: true,
  },

  // ── surface-edit (no mention by construction) ────────────────────────────
  modify_doc: { id: 'modify_doc', category: 'surface-edit', audience: 'all' },
  edit_current_doc: { id: 'edit_current_doc', category: 'surface-edit', audience: 'all' },
  edit_current_board: { id: 'edit_current_board', category: 'surface-edit', audience: 'all' },
  modify_board: { id: 'modify_board', category: 'surface-edit', audience: 'all' },
  share_doc: { id: 'share_doc', category: 'surface-edit', audience: 'all' },
  edit_sheet: { id: 'edit_sheet', category: 'surface-edit', audience: 'all' },

  // ── processing ───────────────────────────────────────────────────────────
  summary: {
    id: 'summary',
    category: 'processing',
    audience: 'all',
    mention: {
      slug: 'zusammenfassung',
      title: 'Zusammenfassung',
      description: 'Dokument(e) zusammenfassen',
      avatar: '📝',
      backgroundColor: '#0891B2',
    },
  },
  compute: {
    id: 'compute',
    category: 'processing',
    audience: 'all',
    mention: {
      slug: 'rechnen',
      aliases: ['berechnen'],
      title: 'Rechnen',
      description: 'Berechnungen und Datenauswertung mit Python',
      avatar: '🧮',
      backgroundColor: '#316049',
    },
  },

  // ── internal ─────────────────────────────────────────────────────────────
  produktion: { id: 'produktion', category: 'internal', audience: 'all' },
  direct: { id: 'direct', category: 'internal', audience: 'all' },
  greeting: { id: 'greeting', category: 'internal', audience: 'all' },
  agentic: { id: 'agentic', category: 'internal', audience: 'all' },
};

/** Every intent, in enum order. */
export const ALL_CHAT_INTENTS: readonly ChatIntentDefinition[] = searchIntentSchema.options.map(
  (id) => CHAT_INTENTS[id]
);

/** The intents that offer an `@mention`, in enum order. */
export function mentionableIntents(): ChatIntentDefinition[] {
  return ALL_CHAT_INTENTS.filter((i) => 'mention' in i && i.mention);
}

/** One entry per pickable mention, variants included, paired with its intent. */
export function allIntentMentions(): Array<{
  intent: ChatIntentDefinition;
  mention: IntentMention;
}> {
  const out: Array<{ intent: ChatIntentDefinition; mention: IntentMention }> = [];
  for (const intent of ALL_CHAT_INTENTS) {
    if (!('mention' in intent)) continue;
    if (intent.mention) out.push({ intent, mention: intent.mention });
    for (const variant of intent.variantMentions ?? []) out.push({ intent, mention: variant });
  }
  return out;
}

/**
 * The `forcedTools` string a mention for this intent emits — the intent id
 * unless history left a pseudo-identifier.
 */
export function forcedToolFor(intent: ChatIntentDefinition): string {
  if ('mention' in intent && intent.mention?.forcedTool) return intent.mention.forcedTool;
  if (intent.category === 'artifact' && intent.forcedTool) return intent.forcedTool;
  return intent.id;
}

/** Whether the intent may run for a user in this locale. */
export function isIntentAllowedForLocale(
  id: ChatIntentId,
  locale: string | null | undefined
): boolean {
  const audience = CHAT_INTENTS[id].audience;
  return audience === 'all' || audience === (locale ?? 'de-DE');
}

/** Where a locale-mismatched turn should go instead (undefined = leave as is). */
export function degradeTargetForLocale(
  id: ChatIntentId,
  locale: string | null | undefined
): ChatIntentId | undefined {
  if (isIntentAllowedForLocale(id, locale)) return undefined;
  return CHAT_INTENTS[id].degradeTo;
}

/** The honest one-liner for a forced but unavailable intent. */
export function intentDeclineNote(id: ChatIntentId): string | undefined {
  return CHAT_INTENTS[id].declineNote;
}

/**
 * Intent → tool name for the LIVE card and the PERSISTED one. Kept as one
 * derivation so the client and server maps cannot drift; each side filters to
 * what it needs (see `INTENT_TO_TOOL_SHARED` in contracts for the history).
 */
export function intentToolNames(): {
  ui: Readonly<Record<string, string>>;
  persist: Readonly<Record<string, string>>;
} {
  const ui: Record<string, string> = {};
  const persist: Record<string, string> = {};
  for (const intent of ALL_CHAT_INTENTS) {
    const uiTool = intent.category === 'retrieval' ? intent.uiTool : undefined;
    const persistTool =
      (intent.category === 'retrieval' || intent.category === 'generation'
        ? intent.persistTool
        : undefined) ?? uiTool;
    if (uiTool) ui[intent.id] = uiTool;
    if (persistTool) persist[intent.id] = persistTool;
  }
  return { ui: Object.freeze(ui), persist: Object.freeze(persist) };
}

/**
 * Die Dispositions-Achse. Re-exportiert, damit `@gruenerator/shared/chat-intents`
 * die eine Adresse für „alles über Intents" bleibt — ein zweiter Importpfad wäre
 * die erste Gelegenheit für eine zweite Wahrheit.
 */
export {
  type Disposition,
  DISPOSITION_BY_INTENT,
  DISPOSITION_ORDER,
  dispositionOf,
  intentsWithDisposition,
} from './dispositions.js';
