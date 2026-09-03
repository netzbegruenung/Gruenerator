// Single platform-neutral registry: tool name → metadata + view kind + parser.
//
// Web (GrueneratorToolUIs / ToolCallUI) and mobile (MessageBubble) both
// dispatch through this registry, so the set of chat tools lives in exactly
// one place — `toolRegistry.vitest.ts` enforces that every tool name the SSE
// mappings can produce has an entry. Platforms only map ToolViewKind →
// component. Metro-safe: zod + toolResults/toolViewModels only.

import { z } from 'zod';

import {
  getArray,
  getBoolean,
  getNumber,
  getObject,
  getString,
  getToolMeta,
  parseExamples,
  parsePersonResult,
  parsePressemitteilungExamples,
  parseResearchResult,
  parseScrapeResult,
  parseSearchCitations,
  parseWebCitations,
  toSerializableCitation,
  type ToolMeta,
} from './toolResults';

import type { KeyValueEntry, ToolResultVM, ToolViewKind } from './toolViewModels';
import type { SerializableCitation } from '../components/tool-ui/citation/schema';

export const UI_TOOL_NAMES = z.enum([
  'gruenerator_search',
  'gruenerator_docs_search',
  'search_sources',
  'search_user_content',
  'web_search',
  'bundestag',
  'research',
  'gruenerator_examples_search',
  'gruenerator_pressemitteilung_examples',
  'gruenerator_person_search',
  'scrape_url',
  'generate_image',
  'recall_memory',
  'save_memory',
  'search_chat_history',
  'ask_human',
  'run_python',
  'edit_document',
  'mcp_tool',
  'find_content',
  'documents',
  'boards_tasks',
  'groups',
  'media',
  'notebooks',
  'read_pdf_form',
  'fill_pdf_form',
  'cloud_files',
  'recurring_tasks',
  'user_agents',
  'recipes',
  // --- Loop-catalog tools that had no UI entry until now. Every string here is
  // copied verbatim from its API mount site; toolCatalogUiCoverage.vitest.ts in
  // apps/api enforces exactly that. F0: additive only, never renamed.
  'rezept_laden',
  'sharepic',
  'create_document',
  'create_presentation',
  'create_sheet',
  'create_pdf',
  'create_board',
  'umfragen',
  'abgeordnetenwatch',
  'summarize',
  'product_knowledge',
  'expand_attachment',
  'dokumente_lesen',
  'search_threads',
  'read_artifact',
  'memory',
]);
export type UiToolName = z.infer<typeof UI_TOOL_NAMES>;

export interface ToolRegistryEntry {
  meta: ToolMeta;
  kind: ToolViewKind;
  /** Tolerant — never throws; degrades to text-note/key-value on unexpected shapes. */
  parse: (args: unknown, result: unknown) => ToolResultVM;
}

// ---------------------------------------------------------------------------
// Generic fallback: renders ANY tool result legibly (replaces web's raw JSON
// dump and mobile's bare pill for unregistered tools).
// ---------------------------------------------------------------------------

const MARKDOWNISH_KEYS = ['answer', 'markdown', 'content', 'text', 'summary'];
const LIFTED_KEYS = new Set([
  ...MARKDOWNISH_KEYS,
  'results',
  'citations',
  'image',
  'imageUrl',
  // Lifted so an unregistered failing tool does not show its failure as a
  // key/value row literally labelled "error"; the card renders it as an error.
  'error',
  // Live-only success flag (parseSSEStream folds it in); never a data row.
  'ok',
]);

function liftCitations(result: unknown): SerializableCitation[] {
  const items =
    getArray(result, 'results') ??
    getArray(result, 'citations') ??
    (Array.isArray(result) ? result : null);
  if (!items) return [];
  return items
    .filter((item) => getString(item, 'url'))
    .slice(0, 5)
    .map((item, i) => toSerializableCitation(item, i, 'webpage'));
}

function liftMarkdown(result: unknown): string | null {
  for (const key of MARKDOWNISH_KEYS) {
    const val = getString(result, key);
    if (val && val.length > 120) return val;
  }
  return null;
}

function liftImageUrl(result: unknown): string | null {
  return getString(getObject(result, 'image'), 'url') ?? getString(result, 'imageUrl');
}

export function parseGenericFallback(_args: unknown, result: unknown): ToolResultVM {
  if (result == null) return { kind: 'text-note', text: '' };
  if (typeof result === 'string') return { kind: 'text-note', text: result };

  const citations = liftCitations(result);
  const markdown = liftMarkdown(result);
  const imageUrl = liftImageUrl(result);

  const entries: KeyValueEntry[] = [];
  if (typeof result === 'object' && !Array.isArray(result)) {
    for (const [key, val] of Object.entries(result as Record<string, unknown>)) {
      if (entries.length >= 8) break;
      if (LIFTED_KEYS.has(key)) continue;
      if (typeof val === 'string' && val && val.length <= 120) {
        entries.push({ label: key, value: val });
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        entries.push({ label: key, value: String(val) });
      }
    }
  }

  // A pure text payload reads better as a note than as a one-row table.
  if (!entries.length && !citations.length && !imageUrl && markdown) {
    return { kind: 'text-note', text: markdown };
  }
  return { kind: 'key-value', entries, citations, markdown, imageUrl };
}

// ---------------------------------------------------------------------------
// Per-tool parsers (thin VM wrappers over the tolerant toolResults accessors).
// ---------------------------------------------------------------------------

function parseImageVM(args: unknown, result: unknown): ToolResultVM {
  const image = getObject(result, 'image');
  const url = getString(image, 'url') ?? getString(result, 'url') ?? getString(result, 'imageUrl');
  if (!url) return parseGenericFallback(args, result);
  const prompt = getString(args, 'prompt') ?? getString(image, 'prompt');
  return { kind: 'image', url, prompt, alt: prompt };
}

/** Field inventory of a PDF form — a compact summary, never the raw list (a
 *  200-field form would bury the card). */
function parsePdfFormReadVM(args: unknown, result: unknown): ToolResultVM {
  const fieldCount = getNumber(result, 'fieldCount');
  if (fieldCount == null) return parseGenericFallback(args, result);
  if (fieldCount === 0) {
    return {
      kind: 'text-note',
      text: getString(result, 'note') ?? 'Dieses PDF hat keine ausfüllbaren Formularfelder.',
    };
  }
  const shown = getArray(result, 'fields')?.length ?? 0;
  const entries: KeyValueEntry[] = [
    { label: 'Datei', value: getString(result, 'fileName') ?? '—' },
    { label: 'Felder', value: String(fieldCount) },
  ];
  // Paged reads must say so — otherwise the card implies the whole form.
  if (getBoolean(result, 'hasMore')) {
    entries.push({ label: 'Gelesen', value: `${shown} von ${fieldCount}` });
  }
  return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
}

/** Fill outcome. Counts, not the field list — the arrays may be truncated. */
function parsePdfFormFillVM(args: unknown, result: unknown): ToolResultVM {
  const fileName = getString(result, 'fileName');
  const filled = getNumber(result, 'filledCount');
  if (!fileName || filled == null) return parseGenericFallback(args, result);
  const skipped = getNumber(result, 'skippedCount');
  const skipNote = skipped ? ` ${skipped} Feld(er) übersprungen.` : '';
  return {
    kind: 'text-note',
    text: `${filled} Feld(er) in „${fileName}" ausgefüllt.${skipNote}`,
  };
}

function parseTextNoteVM(args: unknown, result: unknown): ToolResultVM {
  const text =
    typeof result === 'string'
      ? result
      : (getString(result, 'summary') ??
        getString(result, 'memory') ??
        getString(result, 'message') ??
        // product_knowledge returns instruction prose, umfragen a poll digest.
        getString(result, 'knowledge') ??
        getString(result, 'umfragen'));
  if (!text) return parseGenericFallback(args, result);
  return { kind: 'text-note', text };
}

// memory: the card is the only place the person sees what was kept, changed
// or dropped — so it shows the text, never the model-facing `hinweis`.
function parseMemoryVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const text = getString(result, 'text');
  if (!text) return parseGenericFallback(args, result);
  if (getBoolean(result, 'gespeichert')) {
    const already = getString(result, 'hinweis') != null;
    return { kind: 'text-note', text: `${already ? 'Bereits gemerkt' : 'Gemerkt'}: ${text}` };
  }
  if (getBoolean(result, 'aktualisiert'))
    return { kind: 'text-note', text: `Aktualisiert: ${text}` };
  if (getBoolean(result, 'vergessen')) return { kind: 'text-note', text: `Vergessen: ${text}` };
  return parseGenericFallback(args, result);
}

// rezept_laden is a SWITCH, not a search: it registers a writing recipe for the
// rest of the turn and returns a tiny acknowledgement. Show the recipe TITLE —
// never the mention id (`presse`) and never `hinweis`, which is an instruction
// addressed to the model, not to the reader.
function parseRecipeVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  if (!getBoolean(result, 'geladen')) {
    const grund = getString(result, 'grund');
    return { kind: 'text-note', text: grund ?? 'Rezept konnte nicht geladen werden.' };
  }
  const titel = getString(result, 'titel') ?? getString(result, 'rezept');
  if (!titel) return parseGenericFallback(args, result);
  return { kind: 'text-note', text: `Rezept „${titel}" geladen.` };
}

// The doc family already renders a rich DocumentCreatedCard off the `done`
// metadata, so this card stays deliberately slim — two cards for one artifact
// would double-represent it.
function parseArtifactCreatedVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const title = getString(getObject(result, 'document'), 'title');
  if (title) return { kind: 'text-note', text: `„${title}" erstellt.` };
  const note = getString(result, 'note');
  return note ? { kind: 'text-note', text: note } : parseGenericFallback(args, result);
}

// create_pdf carries a self-check the user can see NOWHERE else: `probleme` is
// dropped entirely by the generic fallback's 8-entry <dl>. One row per problem.
function parsePdfCreatedVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const title = getString(getObject(result, 'document'), 'title');
  if (!title) return parseGenericFallback(args, result);

  const entries: KeyValueEntry[] = [{ label: 'Datei', value: title }];
  const fields = getArray(result, 'felder');
  if (fields?.length) entries.push({ label: 'Felder', value: String(fields.length) });
  for (const [i, problem] of (getArray(result, 'probleme') ?? []).entries()) {
    const text = typeof problem === 'string' ? problem : getString(problem, 'hinweis');
    if (text) entries.push({ label: i === 0 ? 'Prüfung' : ' ', value: text });
  }
  return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
}

// Boards emit no document_created event — this card is the ONLY place a created
// board is ever named, which is why it carries the title rather than staying slim.
function parseBoardCreatedVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const title = getString(getObject(result, 'board'), 'title');
  if (title) return { kind: 'text-note', text: `Board „${title}" erstellt.` };
  const note = getString(result, 'note');
  return note ? { kind: 'text-note', text: note } : parseGenericFallback(args, result);
}

// The variants themselves render in SharepicVariantStack; the card only reports.
function parseSharepicVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const note = getString(result, 'note');
  return note ? { kind: 'text-note', text: note } : parseGenericFallback(args, result);
}

// read_artifact has an ambiguous-match branch (`candidates`) that the generic
// fallback loses completely — it is exactly the branch the reader must act on.
function parseReadArtifactVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };

  const candidates = getArray(result, 'candidates');
  if (candidates?.length) {
    const entries: KeyValueEntry[] = candidates.flatMap((c) => {
      const title = getString(c, 'title');
      return title ? [{ label: title, value: getString(c, 'id') ?? '' }] : [];
    });
    if (entries.length) {
      return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
    }
  }

  const title = getString(result, 'title') ?? getString(getObject(result, 'document'), 'title');
  if (title) {
    const truncated = getBoolean(result, 'truncated') ? ' (gekürzt)' : '';
    return { kind: 'text-note', text: `${title}${truncated}` };
  }
  return parseGenericFallback(args, result);
}

function parseLinkPreviewVM(args: unknown, result: unknown): ToolResultVM {
  const page = parseScrapeResult(args, result);
  if (!page) return parseGenericFallback(args, result);
  return {
    kind: 'link-preview',
    href: page.url,
    title: page.domain ?? page.url,
    description: page.snippet || null,
    domain: page.domain,
    // No favicon: the source's own domain line plus the SourceGlyph identify it
    // without a request to a third-party icon service (see urlUtils).
    favicon: null,
  };
}

// Personal-data resource tools (find_content/documents/boards_tasks/notebooks)
// return `{ results: [{title, url, snippet}] }` for list/search actions → a
// clickable citation list; other actions (get/get_cards) return a detail object
// → the generic key-value fallback. One parser covers both.
function parsePersonalDataVM(args: unknown, result: unknown): ToolResultVM {
  const items = getArray(result, 'results');
  if (items && items.length) {
    return { kind: 'citations', citations: parseSearchCitations(result) };
  }
  return parseGenericFallback(args, result);
}

// notebooks hat neben den Listen zwei eigene Formen: `search` liefert
// `{answer, citations[]}` — die Antwort als Markdown, die Zitate als Liste —
// und `get` ein `{notebook}`-Detailobjekt. Beide fielen sonst in den
// generischen <dl>-Dump; alles andere (list, Vorgänge) geht weiter über
// `parsePersonalDataVM`.
function parseNotebooksVM(args: unknown, result: unknown): ToolResultVM {
  const answer = getString(result, 'answer');
  if (answer) {
    const citations = (getArray(result, 'citations') ?? [])
      .slice(0, 5)
      .map((c, i) => toSerializableCitation(c, i, 'document'));
    const notebook = getString(result, 'notebook');
    return {
      kind: 'key-value',
      entries: notebook ? [{ label: 'Notebook', value: notebook }] : [],
      citations,
      markdown: answer,
      imageUrl: null,
    };
  }
  const notebook = getObject(result, 'notebook');
  if (notebook) {
    const entries: KeyValueEntry[] = [];
    const name = getString(notebook, 'name');
    if (name) entries.push({ label: 'Notebook', value: name });
    const count = getNumber(notebook, 'documentCount');
    if (count != null) entries.push({ label: 'Dokumente', value: String(count) });
    const pending = getNumber(notebook, 'pendingCount');
    if (pending) entries.push({ label: 'Neue Dateien', value: String(pending) });
    const folders = getArray(notebook, 'wolkeFolders') ?? [];
    if (folders.length) {
      entries.push({
        label: 'Wolke-Ordner',
        value: folders.map((f) => getString(f, 'folderName') ?? '—').join(', '),
      });
    }
    const groups = getArray(notebook, 'sharedGroups') ?? [];
    if (groups.length) {
      entries.push({
        label: 'Geteilt mit',
        value: groups.map((g) => getString(g, 'name') ?? '—').join(', '),
      });
    }
    // Ein frisch angelegtes Notebook (`create`) hat nur name + url.
    if (entries.length === 1 && getString(notebook, 'url')) {
      return { kind: 'text-note', text: `Notebook „${name}" angelegt.` };
    }
    return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
  }
  return parsePersonalDataVM(args, result);
}

// groups: `get` liefert ein `{group}`-Detailobjekt (groupTools.ts) — ohne Zweig
// fiel es in den generischen <dl>-Dump mit englischen Schlüsseln. Listen
// (list/find/content) und Vorgänge gehen weiter über `parsePersonalDataVM`.
function parseGroupsVM(args: unknown, result: unknown): ToolResultVM {
  const group = getObject(result, 'group');
  if (group) {
    const entries: KeyValueEntry[] = [];
    const name = getString(group, 'name');
    if (name) entries.push({ label: 'Projekt', value: name });
    const description = getString(group, 'description');
    if (description) entries.push({ label: 'Beschreibung', value: description });
    entries.push({
      label: 'Rolle',
      value: getBoolean(group, 'isAdmin') ? 'Admin' : 'Mitglied',
    });
    const members = getNumber(group, 'memberCount');
    if (members != null) entries.push({ label: 'Mitglieder', value: String(members) });
    entries.push({
      label: 'Sichtbarkeit',
      value: getBoolean(group, 'isPublic') ? 'Öffentlich gelistet' : 'Privat',
    });
    const content = getNumber(group, 'contentCount');
    if (content != null) entries.push({ label: 'Geteilte Inhalte', value: String(content) });
    return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
  }
  return parsePersonalDataVM(args, result);
}

// recurring_tasks: `get` liefert ein `{task}`-Detailobjekt mit fertigen
// Etiketten (recurringTaskTools.ts) — der Takt wird serverseitig beschrieben,
// damit die Wochentagsliste nicht ein drittes Mal existiert. Listen und
// Vorgänge gehen weiter über `parsePersonalDataVM`.
function parseRecurringTasksVM(args: unknown, result: unknown): ToolResultVM {
  const task = getObject(result, 'task');
  if (task) {
    const entries: KeyValueEntry[] = [];
    const title = getString(task, 'title');
    if (title) entries.push({ label: 'Aufgabe', value: title });
    const takt = getString(task, 'recurrenceLabel');
    if (takt) entries.push({ label: 'Takt', value: takt });
    const delivery = getString(task, 'deliveryLabel');
    if (delivery) entries.push({ label: 'Zustellung', value: delivery });
    const agent = getString(task, 'agentTitle') ?? getString(task, 'agentIdentifier');
    entries.push({ label: 'Agent', value: agent ?? 'Grünerator (Standard)' });
    entries.push({ label: 'Status', value: getBoolean(task, 'enabled') ? 'Aktiv' : 'Pausiert' });
    const runs = getArray(result, 'runs') ?? [];
    if (runs.length) {
      entries.push({
        label: 'Letzte Läufe',
        value: runs.map((r) => getString(r, 'statusLabel') ?? '—').join(', '),
      });
    }
    return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
  }
  return parsePersonalDataVM(args, result);
}

// user_agents: `get` liefert ein `{agent}`-Detailobjekt mit fertigen Etiketten
// (userAgentTools.ts); Listen gehen über `parsePersonalDataVM`, die Karten-
// Aktionen und Fehler als Notiz — sonst zeigte der generische Fallback
// `ok`/`needsConfirmation` als Tabellenzeilen.
function parseUserAgentsVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const agent = getObject(result, 'agent');
  if (agent) {
    const entries: KeyValueEntry[] = [];
    const title = getString(agent, 'title');
    if (title) entries.push({ label: 'Name', value: title });
    const description = getString(agent, 'description');
    if (description) entries.push({ label: 'Beschreibung', value: description });
    const shared = getString(agent, 'sharedFromGroup');
    if (shared) {
      entries.push({ label: 'Geteilt aus', value: shared });
      return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
    }
    const tools = getString(agent, 'toolLabels');
    if (tools) entries.push({ label: 'Werkzeuge', value: tools });
    const recipes = getArray(agent, 'skillMentions') ?? [];
    if (recipes.length) {
      entries.push({ label: 'Rezepte', value: recipes.map((r) => String(r)).join(', ') });
    }
    const notebooks = getArray(agent, 'notebooks') ?? [];
    if (notebooks.length) {
      entries.push({
        label: 'Notebooks',
        value: notebooks.map((n) => getString(n, 'name') ?? '—').join(', '),
      });
    }
    const visibility = getString(agent, 'shareModeLabel');
    if (visibility) entries.push({ label: 'Sichtbarkeit', value: visibility });
    return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
  }
  const items = getArray(result, 'results');
  if (items && items.length) return parsePersonalDataVM(args, result);
  const note = getString(result, 'note');
  if (note) return { kind: 'text-note', text: note };
  return parseGenericFallback(args, result);
}

// recipes: `get` liefert `{recipe}` — für eine eigene Textform mit Art,
// Textsorte, Beispielzahl und Stilblock, für ein mitgeliefertes Rezept nur
// Titel, Beschreibung und den Hinweis (der Rumpf bleibt serverseitig).
// Listen gehen über `parsePersonalDataVM`, create/add_examples/delete und
// Fehler als Notiz.
function parseRecipesVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const note = getString(result, 'note');
  if (note) return { kind: 'text-note', text: note };
  const recipe = getObject(result, 'recipe');
  if (recipe) {
    const entries: KeyValueEntry[] = [];
    const title = getString(recipe, 'title');
    if (title) entries.push({ label: 'Name', value: title });
    const mention = getString(recipe, 'mention');
    if (mention) entries.push({ label: 'Mention', value: `@${mention}` });
    if (getString(recipe, 'source') === 'system') {
      const description = getString(recipe, 'description');
      if (description) entries.push({ label: 'Beschreibung', value: description });
      entries.push({ label: 'Art', value: 'Mitgeliefertes Rezept' });
      return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
    }
    const kind = getString(recipe, 'kindLabel');
    if (kind) entries.push({ label: 'Art', value: kind });
    const textType = getString(recipe, 'textTypeLabel');
    if (textType) entries.push({ label: 'Textsorte', value: textType });
    const count = getNumber(recipe, 'exampleCount');
    if (count != null) entries.push({ label: 'Beispiele', value: String(count) });
    const shared = getString(recipe, 'sharedFromGroup');
    if (shared) entries.push({ label: 'Geteilt aus', value: shared });
    const style = getString(recipe, 'styleBlock');
    if (style) {
      entries.push({
        label: getBoolean(recipe, 'styleTruncated') ? 'Stil (gekürzt)' : 'Stil',
        value: style,
      });
    }
    return { kind: 'key-value', entries, citations: [], markdown: null, imageUrl: null };
  }
  const items = getArray(result, 'results');
  if (items && items.length) return parsePersonalDataVM(args, result);
  return parseGenericFallback(args, result);
}

// edit_document (agentic editor edit): the loop step that plans + applies typed
// ops to the open sheet/presentation/board. Result is lean — {ok, operationCount,
// opSummary} | {ok, operationCount:0, note} | {error} — so a compact text-note
// card ("2 Änderungen übernommen · 2× add_slide") reads best.
function parseEditDocumentVM(_args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };
  const note = getString(result, 'note');
  if (note) return { kind: 'text-note', text: note };
  const rawCount = (result as { operationCount?: unknown } | null)?.operationCount;
  const n = typeof rawCount === 'number' ? rawCount : null;
  if (n === 0) return { kind: 'text-note', text: 'Keine Änderung nötig.' };
  const summary = getString(result, 'opSummary');
  const head = n != null ? `${n} Änderung${n === 1 ? '' : 'en'} übernommen` : 'Änderung übernommen';
  return { kind: 'text-note', text: summary ? `${head} · ${summary}` : head };
}

// cloud_files hat vier Ergebnisformen: eine Ordner-/Trefferliste (`entries`),
// eine Verbindungsliste (`connections`), ein gelesenes Dokument (nur
// `resultCount`/`sources` — die Zitate laufen über die Quellen-Registry, nicht
// über die Karte) und Status-/Fehlerzeilen. Ein Parser deckt alle vier ab.
//
// Die Kürzungs-Notiz wird bewusst MITGERENDERT: eine abgeschnittene Liste, die
// wie eine vollständige aussieht, ist genau die Ausfallform, gegen die das
// Werkzeug seine `note` schreibt.
function parseCloudFilesVM(args: unknown, result: unknown): ToolResultVM {
  const error = getString(result, 'error');
  if (error) return { kind: 'text-note', text: error };

  const entries = getArray(result, 'entries');
  if (entries) {
    const rows: KeyValueEntry[] = entries.map((raw) => {
      const name = getString(raw, 'name') ?? getString(raw, 'path') ?? '—';
      const isDirectory = getBoolean(raw, 'isDirectory');
      return { label: isDirectory ? `${name}/` : name, value: getString(raw, 'info') ?? '' };
    });
    const note = getString(result, 'note');
    if (note) rows.push({ label: 'Hinweis', value: note });
    if (rows.length === 0) {
      return { kind: 'text-note', text: 'Der Ordner ist leer.' };
    }
    return { kind: 'key-value', entries: rows, citations: [], markdown: null, imageUrl: null };
  }

  const connections = getArray(result, 'connections');
  if (connections) {
    if (connections.length === 0) {
      return { kind: 'text-note', text: getString(result, 'note') ?? 'Keine Wolke verbunden.' };
    }
    return {
      kind: 'key-value',
      entries: connections.map((raw) => ({
        label: getString(raw, 'label') ?? '—',
        value: getString(raw, 'host') ?? '',
      })),
      citations: [],
      markdown: null,
      imageUrl: null,
    };
  }

  const file = getString(result, 'file');
  if (file) {
    const count = getNumber(result, 'resultCount');
    const note = getString(result, 'note');
    const head = count != null ? `${file} gelesen (${count} Abschnitte)` : `${file} gelesen`;
    return { kind: 'text-note', text: note ? `${head} · ${note}` : head };
  }

  const note = getString(result, 'note');
  if (note) return { kind: 'text-note', text: note };
  return parseGenericFallback(args, result);
}

function entry(name: UiToolName, kind: ToolViewKind, parse: ToolRegistryEntry['parse']) {
  return { meta: getToolMeta(name), kind, parse };
}

export const TOOL_REGISTRY: Record<UiToolName, ToolRegistryEntry> = {
  gruenerator_search: entry('gruenerator_search', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  gruenerator_docs_search: entry('gruenerator_docs_search', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  search_sources: entry('search_sources', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  search_user_content: entry('search_user_content', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  web_search: entry('web_search', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseWebCitations(r),
  })),
  // Loop turns persist the lean { resultCount, sources } (no results array →
  // empty citation list on expand, same as loop web_search); single-pass turns
  // persist { results } which parses into a clickable Drucksachen list.
  bundestag: entry('bundestag', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  research: entry('research', 'markdown-report', (_a, r) => ({
    kind: 'markdown-report',
    ...parseResearchResult(r),
  })),
  gruenerator_examples_search: entry('gruenerator_examples_search', 'snippets', (_a, r) => ({
    kind: 'snippets',
    items: parseExamples(r),
  })),
  gruenerator_pressemitteilung_examples: entry(
    'gruenerator_pressemitteilung_examples',
    'press-examples',
    (_a, r) => ({ kind: 'press-examples', ...parsePressemitteilungExamples(r) })
  ),
  gruenerator_person_search: entry('gruenerator_person_search', 'person', (_a, r) => ({
    kind: 'person',
    ...parsePersonResult(r),
  })),
  scrape_url: entry('scrape_url', 'link-preview', parseLinkPreviewVM),
  generate_image: entry('generate_image', 'image', parseImageVM),
  recall_memory: entry('recall_memory', 'text-note', parseTextNoteVM),
  save_memory: entry('save_memory', 'text-note', parseTextNoteVM),
  memory: entry('memory', 'text-note', parseMemoryVM),
  search_chat_history: entry('search_chat_history', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  ask_human: entry('ask_human', 'interactive', () => ({ kind: 'interactive' })),
  run_python: entry('run_python', 'interactive', () => ({ kind: 'interactive' })),
  edit_document: entry('edit_document', 'text-note', parseEditDocumentVM),
  mcp_tool: entry('mcp_tool', 'key-value', parseGenericFallback),
  find_content: entry('find_content', 'citations', parsePersonalDataVM),
  documents: entry('documents', 'citations', parsePersonalDataVM),
  boards_tasks: entry('boards_tasks', 'citations', parsePersonalDataVM),
  groups: entry('groups', 'citations', parseGroupsVM),
  media: entry('media', 'citations', parsePersonalDataVM),
  notebooks: entry('notebooks', 'citations', parseNotebooksVM),
  read_pdf_form: entry('read_pdf_form', 'key-value', parsePdfFormReadVM),
  // The filled file itself renders in the compute card (fileAssets); the tool
  // card only reports what happened.
  fill_pdf_form: entry('fill_pdf_form', 'text-note', parsePdfFormFillVM),
  cloud_files: entry('cloud_files', 'key-value', parseCloudFilesVM),
  recurring_tasks: entry('recurring_tasks', 'citations', parseRecurringTasksVM),
  user_agents: entry('user_agents', 'citations', parseUserAgentsVM),
  recipes: entry('recipes', 'citations', parseRecipesVM),

  // --- Loop-catalog tools, previously falling through to the raw-name pill ---
  rezept_laden: entry('rezept_laden', 'text-note', parseRecipeVM),
  sharepic: entry('sharepic', 'text-note', parseSharepicVM),
  create_document: entry('create_document', 'text-note', parseArtifactCreatedVM),
  create_presentation: entry('create_presentation', 'text-note', parseArtifactCreatedVM),
  create_sheet: entry('create_sheet', 'text-note', parseArtifactCreatedVM),
  create_pdf: entry('create_pdf', 'key-value', parsePdfCreatedVM),
  create_board: entry('create_board', 'text-note', parseBoardCreatedVM),
  read_artifact: entry('read_artifact', 'text-note', parseReadArtifactVM),
  search_threads: entry('search_threads', 'citations', parsePersonalDataVM),
  umfragen: entry('umfragen', 'text-note', parseTextNoteVM),
  product_knowledge: entry('product_knowledge', 'text-note', parseTextNoteVM),
  summarize: entry('summarize', 'text-note', parseTextNoteVM),
  // The three below report through the status line and draw no card at all
  // (SEARCH_PROGRESS_TOOLS); the entries exist so a reload still resolves a
  // label, and so the drift guard stays total.
  abgeordnetenwatch: entry('abgeordnetenwatch', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  dokumente_lesen: entry('dokumente_lesen', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  expand_attachment: entry('expand_attachment', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
};

/** Lookup that degrades gracefully for unregistered tool names. */
export function resolveToolEntry(toolName: string): ToolRegistryEntry {
  const known = UI_TOOL_NAMES.safeParse(toolName);
  if (known.success) return TOOL_REGISTRY[known.data];
  return { meta: getToolMeta(toolName), kind: 'key-value', parse: parseGenericFallback };
}
