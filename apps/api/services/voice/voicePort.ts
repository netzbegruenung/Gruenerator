/**
 * The voice port: the tools a spoken conversation gets, and only those.
 *
 * Third surface next to the chat loop and MCP (serverFactory.ts). The chat
 * catalog is cut for a chat turn — screen, thread, attachments, follow-up
 * questions — and its notebook strength is not even a tool: a chosen or named
 * notebook takes the turn out of the loop into `searchNode`
 * (routingStage.ts). Voice has no such pre-step, so `notebook_fragen` brings
 * it in as a tool: notebook by name or id, resolved the way the chat resolves
 * "im Berlin-Notebook", answered over the notebook page's fast route.
 *
 * Mistral Small decides when to call; the browser forwards the call to
 * `POST /api/voice/agent-session/tools/:name`, and it runs here with the
 * chat's executors. Built like a headless run (`runHeadlessAgenticTurn`): no
 * connector, no thread — the confirm-gated personal-data writes fail safe, as
 * they do over MCP (chatToolBridge.ts).
 */
import { NOTEBOOK_REGISTRY, getNotebookQueryAliases } from '@gruenerator/shared/notebooks';
import { asSchema, tool, type Tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { initializeChatState } from '../../agents/langgraph/ChatGraph/index.js';
import {
  DISABLED_NOTEBOOK_IDS,
  NOTEBOOK_COLLECTION_MAP,
  isNotebookResolvable,
  isUserNotebookId,
} from '../../config/notebookCollectionMap.js';
import { SYSTEM_COLLECTIONS } from '../../config/systemCollectionsConfig.js';
import { collectionsForLocale } from '../../routes/chat/agents/searchTools.js';
import { buildChatToolCatalog } from '../../routes/chat/agents/toolCatalog.js';
import { createSourceRegistry } from '../../routes/chat/services/agenticLoop/sourceRegistry.js';
import { truncateResultForModel } from '../../routes/chat/services/agenticLoop/truncate.js';
import { resolveNotebookScopeFromText } from '../../routes/chat/services/notebookScopeFromText.js';
import { createNullSSE } from '../../routes/chat/services/sseHelpers.js';
import { formatToolResult } from '../../routes/mcp-server/chatToolBridge.js';
import { createLogger } from '../../utils/logger.js';
import { notebookQAService } from '../notebook/NotebookQAService.js';
import { runNotebookSearch } from '../notebook/notebookToolSearch.js';

import type { QAResponse } from '../notebook/types.js';

const log = createLogger('voicePort');

type UserLocale = 'de-DE' | 'de-AT';

export const NOTEBOOK_TOOL = 'notebook_fragen';

interface PortEntry {
  /** Spoken in the agent's voice while the call runs. */
  filler: string;
  timeoutMs: number;
  /** Replaces the chat description where the chat's planner wording misleads a voice agent. */
  description?: string;
}

const LOOKUP: PortEntry = { filler: 'Einen Moment, ich schaue nach.', timeoutMs: 20_000 };

/**
 * Left out on purpose: creating and editing (sharepics, documents, sheets …)
 * needs a screen; `scrape_url`, the example corpora and `read_artifact` feed
 * writing, not a conversation; `memory` writes; deep research takes minutes.
 */
const VOICE_PORT: Record<string, PortEntry> = {
  [NOTEBOOK_TOOL]: { filler: 'Ich schau kurz im Notebook nach.', timeoutMs: 60_000 },
  gruenerator_search: { ...LOOKUP, filler: 'Ich schau in den Programmen und Beschlüssen nach.' },
  web_search: { ...LOOKUP, filler: 'Ich suche kurz im Netz.', timeoutMs: 30_000 },
  bundestag: { ...LOOKUP, filler: 'Ich schau beim Bundestag nach.' },
  abgeordnetenwatch: LOOKUP,
  umfragen: LOOKUP,
  notebooks: {
    ...LOOKUP,
    description:
      'Listet die Notebooks der Person (action "list"; scope "mine", "shared" oder "system"). Für Fragen an den INHALT eines Notebooks nimm notebook_fragen, nicht dieses Werkzeug.',
  },
  notebook_quellen: LOOKUP,
  find_content: LOOKUP,
  documents: LOOKUP,
  boards_tasks: LOOKUP,
  groups: LOOKUP,
  search_threads: LOOKUP,
  product_knowledge: LOOKUP,
};

/** Results are read aloud, not pasted into a document. */
const MAX_RESULT_CHARS = 4000;

/** Mistral rejects the whole session (422) when one description exceeds this. */
const MAX_DESCRIPTION_CHARS = 1024;

function clip(text: string): string {
  return text.length <= MAX_DESCRIPTION_CHARS
    ? text
    : `${text.slice(0, MAX_DESCRIPTION_CHARS - 1)}…`;
}

// ── notebook_fragen ─────────────────────────────────────────────────────────

type NotebookTarget = { kind: 'own'; id: string } | { kind: 'system'; notebook: VoiceNotebook };

export interface VoiceNotebook {
  /** Registry slug, e.g. `berlin-notebook`. */
  id: string;
  title: string;
  category: string;
  /** System collection ids the notebook searches (`berlin-system`). */
  collectionIds: string[];
  /** Every way a person may say it: titles, @-alias, query aliases, collection keys. */
  names: string[];
}

/**
 * The system notebooks a voice session may ask: the registry, minus what the
 * product switched off (`enabled: false` — e.g. Hamburg, whose LV dropped its
 * notebook while the collection stays searchable), minus what this instance
 * or locale does not offer. A collection without a live notebook is not one.
 */
export function voiceNotebooks(locale: UserLocale): VoiceNotebook[] {
  const allowed = new Set(collectionsForLocale(locale));
  const out: VoiceNotebook[] = [];
  for (const nb of NOTEBOOK_REGISTRY) {
    if (DISABLED_NOTEBOOK_IDS.has(nb.id) || !isNotebookResolvable(nb.id)) continue;
    const audience = 'audience' in nb ? nb.audience : 'all';
    if (audience !== 'all' && audience !== locale) continue;
    const keys = (NOTEBOOK_COLLECTION_MAP[nb.id] ?? []).filter((k) => allowed.has(k));
    const configs = Object.values(SYSTEM_COLLECTIONS).filter((c) => keys.includes(c.key));
    if (configs.length === 0) continue;
    out.push({
      id: nb.id,
      title: nb.mention.title,
      category: nb.category,
      collectionIds: configs.map((c) => c.id),
      names: [
        nb.title,
        nb.mention.title,
        nb.mention.alias,
        ...getNotebookQueryAliases(nb),
        ...keys,
      ],
    });
  }
  return out;
}

/**
 * An id first (UUID, notebook slug, system id), then the name the way the chat
 * reads "im Berlin-Notebook" — including the person's own and shared
 * notebooks, read-checked later by `runNotebookSearch` — then a spoken form.
 */
async function resolveNotebook(
  userId: string,
  locale: UserLocale,
  ref: string
): Promise<NotebookTarget | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (isUserNotebookId(trimmed)) return { kind: 'own', id: trimmed };
  const notebooks = voiceNotebooks(locale);
  const system = (notebook: VoiceNotebook | undefined): NotebookTarget | null =>
    notebook ? { kind: 'system', notebook } : null;

  const direct = notebooks.find((n) => n.id === trimmed || n.collectionIds.includes(trimmed));
  if (direct) return system(direct);

  const named = await resolveNotebookScopeFromText({ userId, text: `Notebook ${trimmed}`, locale });
  if (named) {
    return isUserNotebookId(named)
      ? { kind: 'own', id: named }
      : system(notebooks.find((n) => n.id === named));
  }

  // Spoken references rarely match a registry title: "Grüne Berlin",
  // "Landesverband Berlin", "die Berliner Grünen" all mean `berlin`.
  const spokenKey = placeKey(trimmed);
  return system(notebooks.find((n) => n.names.some((name) => placeKey(name) === spokenKey)));
}

const NON_PLACE_WORDS = new Set([
  'die',
  'der',
  'den',
  'grüne',
  'grünen',
  'landesverband',
  'lv',
  'notebook',
  'bündnis',
  '90',
]);

/** "Die Berliner Grünen" → "berlin", "Grüne Schleswig-Holstein" → "schleswig-holstein". */
function placeKey(text: string): string {
  return text
    .toLowerCase()
    .split(/[\s/]+/)
    .filter((w) => w && !NON_PLACE_WORDS.has(w))
    .map((w) => (w.length > 5 ? w.replace(/er$/, '') : w))
    .join('-');
}

/** Citation markers like [1] and Markdown headings mean nothing when read aloud. */
function spoken(answer: string): string {
  return answer
    .replace(/\s*\[\d+(?:,\s*\d+)*\]/g, '')
    .replace(/^#+\s*/gm, '')
    .trim();
}

function withSources(name: string, result: QAResponse): string {
  const titles = [
    ...new Set(
      (result.citations ?? [])
        .map((c) => c.document_title ?? c.title)
        .filter((t): t is string => !!t)
    ),
  ].slice(0, 3);
  return [
    `Antwort aus dem Notebook „${name}“:`,
    spoken(result.answer),
    titles.length ? `Quellen: ${titles.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function askNotebook(
  userId: string,
  locale: UserLocale,
  ref: string,
  question: string,
  fastMode: boolean
): Promise<string | { error: string }> {
  const target = await resolveNotebook(userId, locale, ref);
  if (!target) {
    return {
      error: `Kein Notebook „${ref}“ gefunden. Mit notebooks (action "list") siehst du, welche es gibt.`,
    };
  }
  if (target.kind === 'own') {
    const outcome = await runNotebookSearch({
      collectionId: target.id,
      query: question,
      userId,
      fastMode,
    });
    return outcome.ok
      ? withSources(outcome.notebookName, outcome.result)
      : { error: outcome.error };
  }
  const result = await notebookQAService.askMultiCollection({
    question,
    collectionIds: target.notebook.collectionIds,
    fastMode,
  });
  return withSources(target.notebook.title, result);
}

function notebookTool(
  userId: string,
  locale: UserLocale,
  options: { fixedNotebook: string | null; fastMode: boolean }
): Tool {
  return tool({
    description:
      'Beantwortet eine Frage aus einem Notebook, mit Quellen: eigene, geteilte und öffentliche Notebooks sowie die Notebooks der Landesverbände (z. B. „Berlin“, „Hamburg“) und der Bundespartei. Für jede Frage nach dem Inhalt eines Notebooks dieses Werkzeug nehmen.',
    inputSchema: z.object({
      notebook: z.string().describe('Name oder id des Notebooks, z. B. "Berlin"'),
      frage: z.string().describe('Die Frage, vollständig formuliert'),
    }),
    execute: async ({ notebook, frage }) =>
      askNotebook(userId, locale, options.fixedNotebook ?? notebook, frage, options.fastMode),
  });
}

// ── The port ────────────────────────────────────────────────────────────────

interface PortOptions {
  /** Only these port tools (the notebook voice search mounts one). */
  only?: readonly string[];
  /** Pins `notebook_fragen` to one notebook, whatever the model asks for. */
  fixedNotebook?: string | null;
  fastMode?: boolean;
}

async function buildPort(
  userId: string,
  locale: UserLocale,
  options: PortOptions
): Promise<ToolSet> {
  const wanted = (options.only ?? Object.keys(VOICE_PORT)).filter((n) => n in VOICE_PORT);
  const chatTools = wanted.filter((n) => n !== NOTEBOOK_TOOL);
  const tools: ToolSet = {};

  if (chatTools.length > 0) {
    const state = await initializeChatState({
      messages: [{ role: 'user', content: 'Sprachgespräch' }],
      agentId: '',
      userId,
      enabledTools: { search: true, web: true, person: true, examples: true, research: true },
      userLocale: locale,
    });
    // The universal agent resolves without an owner; the personal-data tools
    // read the person from `agentConfig.userId` (as over MCP, chatToolBridge.ts).
    const agentConfig = { ...state.agentConfig, userId };
    const catalog = buildChatToolCatalog({
      agentConfig,
      sourceRegistry: createSourceRegistry(),
      loop: {
        sse: createNullSSE(),
        state: { ...state, agentConfig, intent: 'agentic' },
        threadId: null,
      },
      toolAllowlist: chatTools,
    });
    Object.assign(tools, catalog.tools);
  }
  if (wanted.includes(NOTEBOOK_TOOL)) {
    tools[NOTEBOOK_TOOL] = notebookTool(userId, locale, {
      fixedNotebook: options.fixedNotebook ?? null,
      fastMode: options.fastMode ?? true,
    });
  }
  return tools;
}

/** Function declarations in Mistral's wire format (`/v1/audio/sessions`). */
export async function voicePortDeclarations(
  userId: string,
  locale: UserLocale,
  options: PortOptions = {}
) {
  const tools = await buildPort(userId, locale, options);
  return Object.entries(tools).map(([name, def]) => {
    const entry = VOICE_PORT[name] ?? LOOKUP;
    const description =
      entry.description ?? (typeof def.description === 'string' ? def.description : name);
    return {
      type: 'function' as const,
      function: {
        name,
        description: clip(description),
        parameters: asSchema(def.inputSchema).jsonSchema,
      },
      filler: { type: 'static' as const, text: entry.filler },
      timeout_ms: entry.timeoutMs,
    };
  });
}

export async function runVoicePortTool(
  userId: string,
  locale: UserLocale,
  name: string,
  args: Record<string, unknown>,
  options: PortOptions = {}
): Promise<{ text: string; isError: boolean }> {
  const tools = await buildPort(userId, locale, { ...options, only: [name] });
  const portTool = tools[name];
  if (!portTool?.execute) return { text: `Unbekanntes Werkzeug: ${name}`, isError: true };
  try {
    // Schema defaults are part of the tool: `gruenerator_search` gets its
    // `collection` only here, raw args answer "Sammlung nicht verfügbar".
    const { validate } = asSchema(portTool.inputSchema);
    const parsed = validate ? await validate(args) : { success: true as const, value: args };
    if (!parsed.success) {
      return { text: `Ungültige Argumente: ${parsed.error.message}`, isError: true };
    }
    const raw: unknown = await portTool.execute(parsed.value, {
      toolCallId: `voice-${name}`,
      messages: [],
      context: undefined,
    });
    return formatToolResult(truncateResultForModel(raw, MAX_RESULT_CHARS));
  } catch (err) {
    log.error(`[VoicePort] ${name} failed:`, err);
    return { text: 'Das Werkzeug ist fehlgeschlagen.', isError: true };
  }
}
