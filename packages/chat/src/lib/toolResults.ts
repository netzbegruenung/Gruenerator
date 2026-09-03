// Platform-agnostic parsing & metadata for assistant-ui tool calls.
//
// This module is the shared seam between the web tool UI (lucide + Radix +
// ReactMarkdown) and the mobile tool UI (Ionicons + react-native-markdown).
// It holds ZERO react/DOM imports so it can be exported from `index.native.ts`
// and consumed by Metro. Each platform keeps only its presentation: web maps
// `iconKey` → lucide components, mobile maps `iconKey` → Ionicons names; both
// feed off the same labels, accessors, citation builders, and research parser.

import { type SerializableCitation } from '../components/tool-ui/citation/schema';

import { formatNamespacedToolLabel, toolCountLabel } from './toolMappings';
import { extractDomain, getHostname } from './urlUtils';

import type {
  ExampleSnippet,
  MarkdownReportVM,
  PersonVM,
  PressemitteilungExample,
  PressExamplesVM,
  ResearchCitation,
  ResearchSearchStep,
} from './toolViewModels';

// Parser output types are derived from the Zod view-model schemas in
// toolViewModels.ts (single type source) and re-exported here for
// backward compatibility.
export type {
  ExampleSnippet,
  PressemitteilungExample,
  ResearchCitation,
  ResearchSearchStep,
} from './toolViewModels';
export type ParsedResearchResult = Omit<MarkdownReportVM, 'kind'>;
export type ParsedPersonResult = Omit<PersonVM, 'kind'>;
export type ParsedPressemitteilungExamples = Omit<PressExamplesVM, 'kind'>;

// ---------------------------------------------------------------------------
// Safe accessors for `unknown` tool args/results (was duplicated inline in
// ToolCallUI.tsx and ResearchArtifactCard.tsx).
// ---------------------------------------------------------------------------

export function getString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : null;
  }
  return null;
}

export function getArray(obj: unknown, key: string): unknown[] | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return Array.isArray(val) ? val : null;
  }
  return null;
}

export function getObject(obj: unknown, key: string): Record<string, unknown> | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return val && typeof val === 'object' && !Array.isArray(val)
      ? (val as Record<string, unknown>)
      : null;
  }
  return null;
}

export function getNumber(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'number' ? val : null;
  }
  return null;
}

export function getBoolean(obj: unknown, key: string): boolean {
  if (obj && typeof obj === 'object' && key in obj) {
    return !!(obj as Record<string, unknown>)[key];
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tool metadata: label + a platform-neutral icon key. Web resolves the key to
// a lucide component, mobile to an Ionicons name.
// ---------------------------------------------------------------------------

export type ToolIconKey =
  | 'search'
  | 'globe'
  | 'book'
  | 'sparkles'
  | 'user'
  | 'image'
  | 'external-link'
  | 'message-circle'
  | 'cloud'
  | 'file'
  // Deliberately few: every key costs an entry in mobile's TOTAL
  // `Record<ToolIconKey, IoniconsIconName>` (apps/mobile/.../toolIcons.ts), so
  // a new key is a hard native compile error until both halves are filled in.
  | 'presentation'
  | 'table'
  | 'board'
  | 'chart';

/**
 * Semantic accent, NOT a class name — a Tailwind string could not cross into
 * Metro. Web maps it to a text colour, native may map it to a theme colour.
 */
export type ToolAccent = 'retrieval' | 'knowledge' | 'create' | 'personal' | 'external' | 'neutral';

export interface ToolMeta {
  /** Resting label — what the finished card says. */
  label: string;
  /**
   * Present-tense label shown WHILE the call runs ("Lade Schreibvorgaben").
   * Optional: without it a card shimmers `label`, exactly as before, so the
   * verb pairs can be filled in tool by tool without a flag day.
   */
  activeLabel?: string;
  iconKey: ToolIconKey;
  /** Defaults to 'neutral' at the presentation layer. */
  accent?: ToolAccent;
  /**
   * Extra arg keys to read the card's subject from, tried in order AFTER the
   * `query`/`question` defaults — `rezept_laden` names its arg `rezept`, the
   * create_* family `prompt`.
   */
  queryKeys?: readonly string[];
  /**
   * One-line German outcome for the collapsed card. Tolerant by contract:
   * returns null rather than throwing on an unexpected payload, so a shape
   * change downgrades the line instead of blanking the card.
   */
  summarize?: (args: unknown, result: unknown) => string | null;
}

const TOOL_METADATA: Record<string, ToolMeta> = {
  // --- Retrieval -----------------------------------------------------------
  search_sources: {
    label: 'Quellen',
    activeLabel: 'Suche Quellen',
    iconKey: 'search',
    accent: 'retrieval',
  },
  gruenerator_search: {
    label: 'Dokumente',
    activeLabel: 'Durchsuche Dokumente',
    iconKey: 'search',
    accent: 'retrieval',
  },
  gruenerator_docs_search: {
    label: 'Anleitungen',
    activeLabel: 'Durchsuche Anleitungen',
    iconKey: 'book',
    accent: 'knowledge',
  },
  gruenerator_person_search: {
    label: 'Person',
    activeLabel: 'Suche Person',
    iconKey: 'user',
    accent: 'retrieval',
  },
  gruenerator_examples_search: {
    label: 'Beispiele',
    activeLabel: 'Suche Beispiele',
    iconKey: 'image',
    accent: 'retrieval',
  },
  web_search: {
    label: 'Websuche',
    activeLabel: 'Durchsuche das Web',
    iconKey: 'globe',
    accent: 'retrieval',
  },
  bundestag: {
    label: 'Bundestag (DIP)',
    activeLabel: 'Durchsuche den Bundestag',
    iconKey: 'book',
    accent: 'retrieval',
  },
  research: {
    label: 'Deep Research',
    activeLabel: 'Recherchiere',
    iconKey: 'book',
    accent: 'retrieval',
  },
  scrape_url: {
    label: 'URL',
    activeLabel: 'Lese die Seite',
    iconKey: 'external-link',
    accent: 'external',
  },
  gruenerator_pressemitteilung_examples: {
    label: 'Pressemitteilungen',
    activeLabel: 'Suche Pressemitteilungen',
    iconKey: 'file',
    accent: 'retrieval',
  },
  // Backend wire name is the German verb; F1 keeps it even though it now also
  // serves poll data rather than only surveys.
  umfragen: {
    label: 'Umfragen',
    activeLabel: 'Rufe Umfragewerte ab',
    iconKey: 'chart',
    accent: 'retrieval',
    queryKeys: ['topic', 'bundesland'],
  },
  abgeordnetenwatch: {
    label: 'Abgeordnetenwatch',
    activeLabel: 'Frage Abgeordnetenwatch ab',
    iconKey: 'user',
    accent: 'retrieval',
  },

  // --- Knowledge / context -------------------------------------------------
  product_knowledge: {
    label: 'Produktwissen',
    activeLabel: 'Schlage im Produktwissen nach',
    iconKey: 'book',
    accent: 'knowledge',
  },
  // F1: the wire name says "summarize", but it summarises the ATTACHMENTS of
  // this turn, not a search. Renaming it would break persisted threads.
  summarize: {
    label: 'Zusammenfassung',
    activeLabel: 'Fasse zusammen',
    iconKey: 'file',
    accent: 'knowledge',
  },
  expand_attachment: {
    label: 'Anhang',
    activeLabel: 'Lese den Anhang',
    iconKey: 'file',
    accent: 'knowledge',
  },
  // F1: German wire name, and it reads slices rather than whole documents.
  dokumente_lesen: {
    label: 'Dokumente',
    activeLabel: 'Lese die Dokumente',
    iconKey: 'file',
    accent: 'knowledge',
  },
  rezept_laden: {
    label: 'Schreibvorgaben',
    activeLabel: 'Lade Schreibvorgaben',
    iconKey: 'book',
    accent: 'knowledge',
    queryKeys: ['rezept'],
    // The backend already sends "Rezept: <titel>" (wrapTools.ts) on the live
    // turn; this is the reload path, where only the persisted result survives.
    summarize: (_args, result) => {
      if (getBoolean(result, 'geladen')) {
        const titel = getString(result, 'titel') ?? getString(result, 'rezept');
        return titel ? `Rezept: ${titel}` : 'Rezept geladen';
      }
      return getString(result, 'grund') ?? 'Rezept nicht verfügbar';
    },
  },

  // --- Memory / personal content -------------------------------------------
  memory: {
    label: 'Gedächtnis',
    activeLabel: 'Merke mir',
    iconKey: 'message-circle',
    accent: 'personal',
    queryKeys: ['text'],
    // Reload path: the live turn already got this line from wrapTools.ts.
    summarize: (_args, result) => {
      const text = getString(result, 'text');
      if (!text) return getString(result, 'error');
      if (getBoolean(result, 'gespeichert')) {
        return `${getString(result, 'hinweis') != null ? 'Bereits gemerkt' : 'Gemerkt'}: ${text}`;
      }
      if (getBoolean(result, 'aktualisiert')) return `Aktualisiert: ${text}`;
      if (getBoolean(result, 'vergessen')) return `Vergessen: ${text}`;
      return null;
    },
  },
  recall_memory: {
    label: 'Erinnerung',
    activeLabel: 'Erinnere mich',
    iconKey: 'message-circle',
    accent: 'personal',
  },
  save_memory: {
    label: 'Speichern',
    activeLabel: 'Speichere',
    iconKey: 'message-circle',
    accent: 'personal',
  },
  search_chat_history: {
    label: 'Frühere Inhalte',
    activeLabel: 'Durchsuche frühere Inhalte',
    iconKey: 'message-circle',
    accent: 'personal',
  },
  search_threads: {
    label: 'Frühere Chats',
    activeLabel: 'Durchsuche frühere Chats',
    iconKey: 'message-circle',
    accent: 'personal',
  },
  search_user_content: {
    label: 'Inhalte',
    activeLabel: 'Durchsuche deine Inhalte',
    iconKey: 'search',
    accent: 'personal',
  },
  find_content: {
    label: 'Meine Inhalte',
    activeLabel: 'Durchsuche meine Inhalte',
    iconKey: 'search',
    accent: 'personal',
  },
  documents: {
    label: 'Dokumente',
    activeLabel: 'Suche Dokumente',
    iconKey: 'file',
    accent: 'personal',
  },
  boards_tasks: {
    label: 'Boards & Aufgaben',
    activeLabel: 'Suche Boards & Aufgaben',
    iconKey: 'file',
    accent: 'personal',
  },
  groups: {
    label: 'Projekte',
    activeLabel: 'Sehe im Projekt nach',
    iconKey: 'user',
    accent: 'personal',
  },
  media: { label: 'Medien', activeLabel: 'Suche Medien', iconKey: 'image', accent: 'personal' },
  notebooks: {
    label: 'Notebooks',
    activeLabel: 'Durchsuche Notebooks',
    iconKey: 'book',
    accent: 'personal',
  },
  read_artifact: {
    label: 'Artefakt',
    activeLabel: 'Öffne das Artefakt',
    iconKey: 'file',
    accent: 'personal',
  },
  cloud_files: {
    label: 'Wolke',
    activeLabel: 'Sehe in der Wolke nach',
    iconKey: 'cloud',
    accent: 'personal',
  },
  recurring_tasks: {
    label: 'Wiederkehrende Aufgaben',
    activeLabel: 'Sehe bei den Aufgaben nach',
    iconKey: 'sparkles',
    accent: 'personal',
  },
  user_agents: {
    label: 'Grünerator-Agenten',
    activeLabel: 'Sehe bei den Grünerator-Agenten nach',
    iconKey: 'user',
    accent: 'personal',
  },
  recipes: {
    label: 'Rezepte & Textformen',
    activeLabel: 'Sehe bei den Rezepten nach',
    iconKey: 'sparkles',
    accent: 'personal',
  },

  // --- Creation ------------------------------------------------------------
  generate_image: {
    label: 'Bild',
    activeLabel: 'Erzeuge ein Bild',
    iconKey: 'sparkles',
    accent: 'create',
  },
  sharepic: {
    label: 'Sharepic',
    activeLabel: 'Erstelle Sharepic',
    iconKey: 'image',
    accent: 'create',
    queryKeys: ['text', 'prompt'],
  },
  create_document: {
    label: 'Dokument',
    activeLabel: 'Erstelle Dokument',
    iconKey: 'file',
    accent: 'create',
    queryKeys: ['prompt', 'titel'],
    summarize: (_args, result) => artifactTitle(result),
  },
  create_presentation: {
    label: 'Präsentation',
    activeLabel: 'Erstelle Präsentation',
    iconKey: 'presentation',
    accent: 'create',
    queryKeys: ['prompt', 'thema'],
    summarize: (_args, result) => artifactTitle(result),
  },
  create_sheet: {
    label: 'Tabelle',
    activeLabel: 'Erstelle Tabelle',
    iconKey: 'table',
    accent: 'create',
    queryKeys: ['prompt'],
    summarize: (_args, result) => artifactTitle(result),
  },
  create_pdf: {
    label: 'PDF',
    activeLabel: 'Erstelle PDF',
    iconKey: 'file',
    accent: 'create',
    queryKeys: ['prompt'],
    // The self-check's findings are the one thing in this payload that appears
    // nowhere else, so they belong in the collapsed line, not only in the body.
    summarize: (_args, result) => {
      const title = artifactTitle(result);
      const problems = getArray(result, 'probleme')?.length ?? 0;
      if (!title) return null;
      if (problems === 0) return `${title} · geprüft`;
      return `${title} · ${problems} ${problems === 1 ? 'Hinweis' : 'Hinweise'} aus der Prüfung`;
    },
  },
  create_board: {
    label: 'Board',
    activeLabel: 'Erstelle Board',
    iconKey: 'board',
    accent: 'create',
    queryKeys: ['prompt'],
    // Boards emit no document_created event, so this card is the ONLY place the
    // board is ever named — unlike the doc family, which has DocumentCreatedCard.
    summarize: (_args, result) => getString(getObject(result, 'board'), 'title'),
  },
  edit_document: {
    label: 'Bearbeitung',
    activeLabel: 'Bearbeite',
    iconKey: 'file',
    accent: 'create',
  },
  read_pdf_form: {
    label: 'Formularfelder',
    activeLabel: 'Lese Formularfelder',
    iconKey: 'file',
    accent: 'create',
  },
  fill_pdf_form: {
    label: 'Formular ausfüllen',
    activeLabel: 'Fülle das Formular',
    iconKey: 'file',
    accent: 'create',
  },
  sharepic_edit: {
    label: 'Sharepic',
    activeLabel: 'Bearbeite Sharepic',
    iconKey: 'image',
    accent: 'create',
  },
  reel_edit: { label: 'Reel', activeLabel: 'Bearbeite Reel', iconKey: 'image', accent: 'create' },

  // --- Interactive / external ----------------------------------------------
  ask_human: { label: 'Rückfrage', iconKey: 'message-circle', accent: 'neutral' },
  run_python: {
    label: 'Tabellen-Berechnung',
    activeLabel: 'Rechne',
    iconKey: 'sparkles',
    accent: 'neutral',
  },
  mcp_tool: { label: 'MCP-Tool', iconKey: 'external-link', accent: 'external' },
};

/** Title of a freshly created artifact — the `{ document: {...} }` envelope. */
function artifactTitle(result: unknown): string | null {
  return getString(getObject(result, 'document'), 'title') ?? getString(result, 'title');
}

export function getToolMeta(toolName: string): ToolMeta {
  // Namespaced connector/system tools (s0__x, bahn__x) have no static entry —
  // format them like the live tool cards do so reloads render identically.
  return (
    TOOL_METADATA[toolName] ?? { label: formatNamespacedToolLabel(toolName), iconKey: 'search' }
  );
}

/**
 * The user-facing subject a tool was invoked with, if any. `toolName` is
 * optional so every existing call site keeps working; passing it additionally
 * consults that tool's `queryKeys` (e.g. `rezept` for `rezept_laden`, which
 * otherwise showed no subject at all).
 */
export function getToolQuery(args: unknown, toolName?: string): string | null {
  const direct = getString(args, 'query') ?? getString(args, 'question');
  if (direct) return direct;
  if (!toolName) return null;
  for (const key of getToolMeta(toolName).queryKeys ?? []) {
    const value = getString(args, key);
    if (value) return value;
  }
  return null;
}

/**
 * How many things a finished tool result stands for. Hoisted out of web's
 * ToolCallUI so native reads the same number (it showed none before).
 */
export function getToolResultCount(result: unknown): number {
  if (!result) return 0;
  const citations = getArray(result, 'citations');
  if (citations) return citations.length;
  const arr = getArray(result, 'results') ?? getArray(result, 'examples');
  if (arr) return arr.length;
  if (Array.isArray(result)) return result.length;
  if (getObject(result, 'person')) return 1;
  const rc = getNumber(result, 'resultCount');
  if (rc !== null && rc > 0) return rc;
  return 0;
}

/** How a settled tool call should present itself. */
export type ToolOutcome = 'running' | 'ok' | 'error';

/**
 * The failure message of a call, or null.
 *
 * `result.error` is the channel that SURVIVES a thread reload: wrapTools turns
 * every throw into `{ error }` before the result leaves the backend, and the
 * whole `result` object is what gets persisted.
 */
export function toolErrorMessage(result: unknown): string | null {
  return getString(result, 'error');
}

/**
 * Did this call fail? Two channels carry that one fact and neither is
 * sufficient alone:
 *   - `result.ok === false` — folded in by parseSSEStream from the live
 *     `tool_step_result` event. It is NOT persisted, so it is gone on reload;
 *   - `result.error`        — lives inside `result`, so it does survive.
 * Reading only `ok` is why a failed connector call came back GREEN after a
 * reload; reading only `error` misses the tools that fail via the flag alone.
 */
export function toolOutcome(result: unknown, state: 'call' | 'result'): ToolOutcome {
  if (state !== 'result' || result == null) return 'running';
  if (toolErrorMessage(result)) return 'error';
  // Explicit `false` only. `getBoolean` must NOT be used here: it reports a
  // MISSING key as false, which is precisely the post-reload shape.
  const ok = typeof result === 'object' ? (result as Record<string, unknown>).ok : undefined;
  return ok === false ? 'error' : 'ok';
}

/**
 * The collapsed card's one-line outcome, or null when there is nothing worth
 * saying. Precedence, and each step is load-bearing:
 *   1. `error`            — a failure must never read as success;
 *   2. `meta.summarize`   — per-tool and structural. Ahead of (3) because
 *      wrapTools' own summariser returns nothing for the whole create_* family,
 *      so those tools have no backend line to fall back on;
 *   3. `result.summary`   — what the backend sent (wrapTools → parseSSEStream);
 *   4. count-derived      — "3 Suchen", via the shared plural table;
 *   5. null.
 */
export function toolResultSummary(toolName: string, args: unknown, result: unknown): string | null {
  if (result == null) return null;

  const error = getString(result, 'error');
  if (error) return error;

  const custom = getToolMeta(toolName).summarize;
  if (custom) {
    // Tolerant by contract: a payload shape change must downgrade the line,
    // never blank the card or throw through the render.
    try {
      const line = custom(args, result);
      if (line) return line;
    } catch {
      /* fall through to the generic paths */
    }
  }

  const backend = getString(result, 'summary');
  if (backend) return backend;

  const count = getToolResultCount(result);
  return count > 0 ? toolCountLabel(toolName, count) : null;
}

// ---------------------------------------------------------------------------
// Citation builders → SerializableCitation (the JSON-safe citation shape both
// the web CitationList and a mobile citation list can render).
// ---------------------------------------------------------------------------

/** Map an arbitrary search/web result item to a SerializableCitation. */
export function toSerializableCitation(
  item: unknown,
  index: number,
  typeHint: 'document' | 'webpage' = 'webpage'
): SerializableCitation {
  const url = getString(item, 'url') || '';
  const domain = getString(item, 'domain') || extractDomain(url) || undefined;
  return {
    id: `tc-citation-${index}`,
    href: url,
    title: getString(item, 'title') || getString(item, 'source') || 'Quelle',
    snippet:
      getString(item, 'snippet') ||
      getString(item, 'content') ||
      getString(item, 'excerpt') ||
      undefined,
    domain,
    type: typeHint,
  };
}

/** Document-search / source-search results → citations (first 5). */
export function parseSearchCitations(result: unknown): SerializableCitation[] {
  const items = getArray(result, 'results') || (Array.isArray(result) ? result : []);
  return items.slice(0, 5).map((item, i) => toSerializableCitation(item, i, 'document'));
}

/** Example-search results → citations (first 5). */
export function parseExampleCitations(result: unknown): SerializableCitation[] {
  const items =
    getArray(result, 'examples') ||
    getArray(result, 'results') ||
    (Array.isArray(result) ? result : []);
  return items.slice(0, 5).map((item, i) => toSerializableCitation(item, i, 'document'));
}

/** Web-search results → citations (first 5). */
export function parseWebCitations(result: unknown): SerializableCitation[] {
  const items = getArray(result, 'results') || [];
  return items.slice(0, 5).map((item, i) => toSerializableCitation(item, i, 'webpage'));
}

// ---------------------------------------------------------------------------
// Research result parsing & markdown helpers.
// ---------------------------------------------------------------------------

export type ResearchConfidence = 'high' | 'medium' | 'low';

/** Human-readable confidence labels (German). Colors are platform-specific. */
export const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'Hohe Konfidenz',
  medium: 'Mittlere Konfidenz',
  low: 'Niedrige Konfidenz',
};

export function parseResearchResult(result: unknown): ParsedResearchResult {
  const answer = getString(result, 'answer');
  const rawCitations = getArray(result, 'citations') ?? [];
  const citations: ResearchCitation[] = rawCitations.map((c, i) => ({
    id: getNumber(c, 'id') ?? i + 1,
    title: getString(c, 'title') ?? 'Quelle',
    url: getString(c, 'url') ?? '',
    domain: getString(c, 'domain') ?? extractDomain(getString(c, 'url')) ?? '',
    snippet: getString(c, 'snippet') ?? '',
  }));

  const followUps = getArray(result, 'followUpQuestions') ?? [];
  const followUpQuestions = followUps.filter((q): q is string => typeof q === 'string');

  const searchSteps = getArray(result, 'searchSteps') ?? [];
  const stepsList: ResearchSearchStep[] = [];
  for (const s of searchSteps) {
    const stepQuery = getString(s, 'query') ?? '';
    if (stepQuery) {
      stepsList.push({
        tool: getString(s, 'tool') ?? '',
        query: stepQuery,
        resultsCount: getNumber(s, 'resultsCount') ?? 0,
      });
    }
  }

  return {
    answer,
    citations,
    confidence: getString(result, 'confidence'),
    followUpQuestions,
    searchStepsCount: searchSteps.length,
    stepsList,
  };
}

/** A research Citation → SerializableCitation (for the citation list). */
export function researchCitationToSerializable(c: ResearchCitation): SerializableCitation {
  const domain = c.domain || extractDomain(c.url) || undefined;
  return {
    type: 'document',
    id: String(c.id),
    title: c.title,
    href: c.url,
    ...(c.snippet ? { snippet: c.snippet } : {}),
    ...(domain ? { domain } : {}),
  };
}

/** First few `##` headings of a markdown answer, for a table-of-contents preview. */
export function extractHeadings(markdown: string): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  for (const line of markdown.split('\n')) {
    // Sliced rather than matched: `/^##\s+(.+?)\s*$/` lets `\s+`, `.+?` and
    // `\s*` split the same whitespace run several ways, which is quadratic in
    // the line length (CodeQL js/polynomial-redos).
    //
    // Deliberately equivalent down to the corner cases, including the odd one:
    // `##` plus two or more blanks still yields an empty heading, because the
    // old `.+?` could consume a blank. `###` and `##x` still do not match (the
    // character after `##` has to be whitespace) and neither does `## ` (the
    // old `.+?` needed a character of its own).
    if (!line.startsWith('##') || line.length < 4 || !/^\s/.test(line.charAt(2))) continue;
    out.push(line.slice(2).trim());
    if (out.length >= 6) break;
  }
  return out;
}

/** First non-heading paragraph of a markdown answer, truncated for preview. */
export function extractFirstParagraph(markdown: string): string {
  if (!markdown) return '';
  const lines = markdown.split('\n');
  const buf: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buf.length > 0) break;
      continue;
    }
    if (trimmed.startsWith('#')) {
      if (buf.length > 0) break;
      continue;
    }
    buf.push(trimmed);
    if (buf.join(' ').length > 240) break;
  }
  const para = buf.join(' ');
  return para.length > 280 ? para.slice(0, 280) + '…' : para;
}

/** Build the markdown document body for "Als Dokument speichern". */
export function buildExportMarkdown(
  query: string,
  answer: string,
  citations: ResearchCitation[]
): string {
  const lines: string[] = [];
  if (query) {
    lines.push(`# Recherche: ${query}`, '');
  }
  lines.push(answer);
  if (citations.length > 0) {
    lines.push('', '## Quellen', '');
    for (const c of citations) {
      lines.push(`- [${c.id}] [${c.title}](${c.url}) — ${c.domain}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// gruenerator_person_search → a single politician profile.
// ---------------------------------------------------------------------------

export function parsePersonResult(result: unknown): ParsedPersonResult {
  const person = getObject(result, 'person');
  if (!getBoolean(result, 'isPersonQuery') || !person) {
    return { found: false, name: null, fraktion: null, wahlkreis: null };
  }
  return {
    found: true,
    name: getString(person, 'name'),
    fraktion: getString(person, 'fraktion'),
    wahlkreis: getString(person, 'wahlkreis'),
  };
}

// ---------------------------------------------------------------------------
// gruenerator_examples_search → platform-tagged content snippets (no URLs, so
// these render as snippets rather than citations).
// ---------------------------------------------------------------------------

export function parseExamples(result: unknown): ExampleSnippet[] {
  const items =
    getArray(result, 'examples') ||
    getArray(result, 'results') ||
    (Array.isArray(result) ? result : []);
  return items
    .map((item) => ({
      platform: getString(item, 'platform'),
      content: getString(item, 'content'),
    }))
    .filter((e) => e.content !== null || e.platform !== null);
}

// ---------------------------------------------------------------------------
// scrape_url → a single link-preview struct (URL + domain + text snippet).
// ---------------------------------------------------------------------------

export interface ScrapedPage {
  url: string;
  domain: string | null;
  snippet: string;
}

export function parseScrapeResult(args: unknown, result: unknown): ScrapedPage | null {
  const url = getString(args, 'url') || '';
  if (!url) return null;
  const content = typeof result === 'string' ? result : getString(result, 'content') || '';
  const snippet = content.length > 200 ? content.slice(0, 200) + '…' : content;
  return { url, domain: extractDomain(url) ?? null, snippet };
}

// ---------------------------------------------------------------------------
// gruenerator_pressemitteilung_examples → press releases grouped by Landesverband.
// ---------------------------------------------------------------------------

const PRESSEMITTEILUNG_LV_LABELS: Record<string, string> = {
  BE: 'Berlin',
  'BE-F': 'Berlin (Fraktion)',
  HH: 'Hamburg',
  TH: 'Thüringen',
  MV: 'Meck-Pomm',
  BB: 'Brandenburg',
  BY: 'Bayern',
  SH: 'Schleswig-Holstein',
};

export function pressemitteilungLvLabel(lv: string): string {
  if (!lv) return 'Landesverband';
  return PRESSEMITTEILUNG_LV_LABELS[lv] ?? lv;
}

export function parsePressemitteilungExamples(result: unknown): ParsedPressemitteilungExamples {
  const raw = getArray(result, 'examples') ?? [];
  const examples: PressemitteilungExample[] = raw.map((ex, i) => ({
    id: getString(ex, 'id') ?? `pm-${i}`,
    title: getString(ex, 'title') ?? 'Ohne Titel',
    body: getString(ex, 'body') ?? '',
    lv: getString(ex, 'lv') ?? '',
    publishedAt: getString(ex, 'publishedAt'),
    url: getString(ex, 'url'),
  }));
  return { examples, message: getString(result, 'message') };
}

/** German short date (e.g. "05. Mai 2026") from an ISO string, or null. */
export function formatGermanDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Re-export so callers needing raw URL helpers don't reach past this module.
export { extractDomain, getHostname };
