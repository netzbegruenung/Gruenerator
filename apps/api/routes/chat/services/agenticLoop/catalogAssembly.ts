/**
 * Womit der Turn arbeitet: die Montage des Werkzeugkatalogs samt allem, was
 * sich daran anhängt — verbundene MCP-Dienste, verwaltete Connectoren,
 * selbstladende Rezepte, die Wiedergabe früherer Werkzeugschritte, die aus
 * früheren Turns übernommenen Quellen und der Wrapper, der Karten, Wächter und
 * Zeitgrenzen einzieht.
 *
 * Alles hier ist EINE Frage — „was steht diesem Turn zur Verfügung?" — und
 * jede Antwort darauf beeinflusst die nächste: die Rezept-Sichtbarkeit hängt am
 * Zustand, die Wiedergabe an den Katalognamen, die Karten-Titel an den
 * MCP-Labels. Getrennt aufgeschrieben stand die Reihenfolge nirgends.
 *
 * Die Lader werden injiziert (`CatalogDeps`), damit die Montage ohne DB, ohne
 * Netz und ohne echte MCP-Server prüfbar ist.
 */
import { loadManagedMcpCatalog as loadManagedMcpCatalogReal } from '../../agents/managedMcpCatalog.js';
import { loadMcpCatalog as loadMcpCatalogReal, type McpCatalog } from '../../agents/mcpCatalog.js';
import {
  buildRecipeCatalog as buildRecipeCatalogReal,
  type RecipeCatalogEntry,
} from '../../agents/recipeCatalog.js';
import { makeRecipeTool } from '../../agents/recipeTools.js';
import { buildChatToolCatalog as buildChatToolCatalogReal } from '../../agents/toolCatalog.js';
import { sendChatWarning, type SSEWriter } from '../sseHelpers.js';
import {
  getRecentThreadSources,
  getRecentToolSteps,
  getThreadLastMcpServer,
  setThreadLastMcpServer,
  type ThreadToolHistory,
} from '../threadPersistenceService.js';

import { isMcpReplayEnabled } from './flags.js';
import { createToolLoopGuards } from './loopGuards.js';
import { buildToolObservationReplay } from './mcpReplay.js';
import { createRecipeRegistry, type RecipeRegistry } from './recipeRegistry.js';
import { type SourceRegistry } from './sourceRegistry.js';
import {
  NEAR_DUPLICATE_EXEMPT_TOOLS,
  TOOL_TIMEOUT_OVERRIDES_MS,
  type PersistedStep,
} from './types.js';
import { wrapToolsForLoop } from './wrapTools.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage, ToolSet } from 'ai';
import type { Request } from 'express';

/** Tools counted against the per-turn search budget (loopGuards). */
export const SEARCH_FAMILY_TOOLS: ReadonlySet<string> = new Set([
  'gruenerator_search',
  'web_search',
  'gruenerator_examples_search',
  'gruenerator_pressemitteilung_examples',
  'scrape_url',
]);

/**
 * Tools whose steps are NOT replayed as cross-turn "observations": side-effecting
 * or generative actions that own their own rehydration path (createdDocument /
 * generatedImage / sharepic card metadata) or emit SSE ops (edit_document).
 * Replaying them as tool messages would double-represent the artefact or make the
 * model think content already exists. Every OTHER mounted tool (search, bundestag,
 * umfragen, summarize, personal-data, MCP, system sources) IS replayed.
 */
const NON_REPLAYABLE_ACTION_TOOLS: ReadonlySet<string> = new Set([
  'edit_document',
  'create_document',
  'create_board',
  'create_sheet',
  'create_presentation',
  'create_pdf',
  'generate_image',
  'sharepic',
]);

/** The loaders the assembly reaches out through. Injected so the mounting order
 *  is testable without a database, a network or a real MCP server. */
export interface CatalogDeps {
  buildChatToolCatalog: typeof buildChatToolCatalogReal;
  loadMcpCatalog: typeof loadMcpCatalogReal;
  loadManagedMcpCatalog: typeof loadManagedMcpCatalogReal;
  buildRecipeCatalog: typeof buildRecipeCatalogReal;
}

const defaultDeps: CatalogDeps = {
  buildChatToolCatalog: buildChatToolCatalogReal,
  loadMcpCatalog: loadMcpCatalogReal,
  loadManagedMcpCatalog: loadManagedMcpCatalogReal,
  buildRecipeCatalog: buildRecipeCatalogReal,
};

export interface AssembledCatalog {
  /** The unwrapped catalog. Kept because the guarantees invoke tools directly. */
  tools: ToolSet;
  /** The user's connected MCP servers, or null when none were mounted. The
   *  caller owns closing it. */
  mcpCatalog: McpCatalog | null;
  /** First-party managed connectors, or null. The caller owns closing it. */
  systemCatalog: McpCatalog | null;
  recipeCatalog: RecipeCatalogEntry[];
  recipeRegistry: RecipeRegistry;
  /** Tool-card labels for BOTH catalogs (user connectors + system sources). */
  toolLabels: Map<string, { serverName: string; toolName: string }>;
  /** How long the (un-budgeted) MCP mount took, so a slow connector shows up in
   *  the end-of-turn line instead of looking like an unexplained hang. */
  mcpMountMs: number;
}

export async function assembleToolCatalog(
  params: {
    state: ChatGraphState;
    sourceRegistry: SourceRegistry;
    sse: SSEWriter;
    req?: Request;
    threadId: string | null;
  },
  deps: CatalogDeps = defaultDeps
): Promise<AssembledCatalog> {
  const { state, sourceRegistry, sse, req, threadId } = params;
  const agentConfig = state.agentConfig;

  // Vor dem Werkzeugkatalog angelegt, obwohl `rezept_laden` erst weiter unten
  // hängt: die PM-Beispielsuche liest die Ebene des geladenen Rezepts, um
  // ihren Landesverbands-Ausschnitt zuzuschneiden, und muss die Registry daher
  // schon beim Bauen des Katalogs kennen. Der Zugriff selbst passiert erst zur
  // Aufrufzeit — bis dahin ist die Registry gefüllt.
  const recipeRegistry = createRecipeRegistry();

  const { tools } = deps.buildChatToolCatalog({
    agentConfig,
    sourceRegistry,
    recipeRegistry,
    loop: { sse, state, ...(req && { req }), threadId },
  });

  // Phase 2: an `mcp` turn also mounts the user's connected MCP server tools
  // (dynamicTool) into the same catalog, so the model composes them with the
  // internal search tools in ONE loop (single-pass, no separate mcp node).
  //
  // Demoted `agentic` turns re-mount the thread's sticky server too: an
  // @mention is stripped from the message text on send, so a follow-up after
  // a clarifying question ("denk dir was aus") carries NO textual trace of
  // the mentioned server — chat_threads.last_mcp_server_id is the only
  // carrier. Without this, the follow-up loses the service entirely.
  const userId = agentConfig.userId;
  const mcpMountStart = Date.now();
  let mcpCatalog: McpCatalog | null = null;
  let systemCatalog: McpCatalog | null = null;
  if ((state.intent === 'mcp' || state.intent === 'agentic') && userId) {
    // Scope precedence: explicit @mention/name-match > this thread's sticky
    // last-used server > null (fan out over all connected servers).
    const explicitScope = state.mcpServerScope ?? null;
    let scope = explicitScope ?? (threadId ? await getThreadLastMcpServer(threadId) : null);
    // Ordinary agentic turns without a sticky server skip the mount — no
    // connect overhead and no fan-out for threads that never used MCP.
    if (state.intent === 'mcp' || scope) {
      mcpCatalog = await deps.loadMcpCatalog({ userId, scope });
      // A STALE sticky scope (server since deleted) must NOT fake the
      // "mentioned service is disconnected" notice — that honesty signal is
      // only for an EXPLICIT mention. mcp turns retry unscoped; agentic turns
      // just drop the catalog.
      if (!explicitScope && scope && mcpCatalog.scopedServerMissing) {
        if (state.intent === 'mcp') {
          mcpCatalog = await deps.loadMcpCatalog({ userId, scope: null });
          scope = null;
        } else {
          await mcpCatalog.close();
          mcpCatalog = null;
        }
      }
      if (mcpCatalog) {
        // Remember the server actually used, so the next unscoped turn re-scopes.
        if (threadId && scope && !mcpCatalog.scopedServerMissing && mcpCatalog.labels.size > 0) {
          void setThreadLastMcpServer(threadId, scope);
        }
        // A server whose tool definitions drifted since approval had its tools
        // withheld. Say so — otherwise it just looks broken or idle, and the
        // user never learns there is something to re-check.
        for (const explanation of mcpCatalog.driftedServers ?? []) {
          sendChatWarning(sse, 'mcp_tools_drifted', explanation);
        }
        Object.assign(tools, mcpCatalog.tools);
      }
    }
  }

  // First-party MANAGED connectors: mounted the same way, from fixed env
  // configs with no user rows.
  //
  // Selection used to be `getSourcesForIntent(intent)` — one source per intent,
  // three for the `reise` umbrella. It is now a list of KEYS the vocabulary
  // trigger produced for this turn (`managedSourceKeys`), so a travel turn
  // simply carries `['bahn','hotel']` and needs no umbrella.
  //
  // Mounting is cheap: `loadManagedMcpCatalog` builds the tools from cached
  // descriptors and opens a connection only when the model actually calls one.
  // The loader also applies the per-user opt-out and the country filter, so no
  // caller can forget either.
  const managedKeys = state.managedSourceKeys ?? [];
  if (managedKeys.length > 0) {
    systemCatalog = await deps.loadManagedMcpCatalog({
      keys: managedKeys,
      sse,
      sourceRegistry,
      userId: userId ?? null,
      userLocale: state.userLocale,
    });
    Object.assign(tools, systemCatalog.tools);
  }
  const mcpMountMs = Date.now() - mcpMountStart;

  // Self-loading recipes. Mounted async like the MCP catalogs (the user's
  // learned text forms need a DB read), and only when nothing already
  // decides the writing form for this turn:
  //   - `activeSkillMention`: the user picked a recipe deliberately and
  //     `buildSystemMessage` already injected it. Letting the model pick a
  //     second one would overrule an explicit choice — same double-injection
  //     guard `product_knowledge` uses.
  //   - `customSystemPrompt`: a thread-level prompt replaces the whole
  //     persona; self-loading a recipe into it would fight the user. A
  //     CATALOGUE role's baustein is the exception (`roleBausteinActive`):
  //     that persona is server-authored, and a "Presse & Social-Media" role
  //     wants the presse recipe rather than being locked out of all of them.
  let recipeCatalog: RecipeCatalogEntry[] = [];
  if (
    !state.activeSkillMention &&
    (!state.customSystemPrompt || state.roleBausteinActive) &&
    state.enabledTools?.['rezept_laden'] !== false
  ) {
    recipeCatalog = await deps.buildRecipeCatalog({
      userLocale: state.userLocale,
      userId: userId ?? null,
      roles: state.userRoles,
    });
    if (recipeCatalog.length > 0) {
      tools.rezept_laden = makeRecipeTool({
        catalog: recipeCatalog,
        registry: recipeRegistry,
        userId: userId ?? null,
      });
    }
  }

  // Tool-card labels for BOTH catalogs (user connectors + system sources).
  const toolLabels = new Map([...(mcpCatalog?.labels ?? []), ...(systemCatalog?.labels ?? [])]);

  return {
    tools,
    mcpCatalog,
    systemCatalog,
    recipeCatalog,
    recipeRegistry,
    toolLabels,
    mcpMountMs,
  };
}

/** The per-turn tool guards. Here rather than at the call site because the
 *  search family they budget is defined here too. */
export function createLoopGuards(
  sourceRegistry: SourceRegistry
): ReturnType<typeof createToolLoopGuards> {
  return createToolLoopGuards({
    searchToolNames: SEARCH_FAMILY_TOOLS,
    // freshSize, NOT size: every guard here budgets THIS turn's research. Once
    // carried sources became citable they joined `size`, and a follow-up in a
    // thread with prior research would have been told it had "already found
    // enough" before running a single search.
    getSourceCount: () => sourceRegistry.freshSize,
    // The web is NOT gated behind the internal document search — no exemption
    // list either, because there is nothing left to be exempt from. Which
    // retrieval a question needs is the classifier's call, made with the whole
    // message and the thread in hand. All the loop still does is refuse to let
    // an internal search that found NOTHING end in an answer from model memory.
    internalFallback: {
      requiredTool: 'gruenerator_search',
      fallbackTool: 'web_search',
    },
  });
}

/**
 * Structured cross-turn replay: feed the model this thread's prior tool
 * interactions as real tool-call/result messages so a follow-up ("und morgen?",
 * "mach das nochmal", "trag das jetzt ein") remembers what was gathered. Covers
 * ALL informational tools (search, bundestag, umfragen, summarize,
 * personal-data, MCP, system sources) — only side-effecting/generative actions
 * are skipped (NON_REPLAYABLE_ACTION_TOOLS). Validity-gated inside
 * buildToolObservationReplay to tools mounted THIS turn. MCP steps stay behind
 * their rollout flag; search/domain replay is always on.
 *
 * Defensive: any loader/build error just skips replay — never breaks a turn.
 */
export async function buildToolReplay(params: {
  threadId: string;
  tools: ToolSet;
  toolHistory?: ThreadToolHistory | null;
  onError: (message: string) => void;
}): Promise<ModelMessage[]> {
  try {
    const catalogNames = new Set(Object.keys(params.tools));
    const recent = params.toolHistory
      ? params.toolHistory.toolSteps()
      : await getRecentToolSteps(params.threadId);
    const replayable = recent.filter(
      (s: PersistedStep) =>
        !NON_REPLAYABLE_ACTION_TOOLS.has(s.toolName) && (s.serverName ? isMcpReplayEnabled() : true)
    );
    return buildToolObservationReplay(replayable, catalogNames);
  } catch (err) {
    params.onError(`[Agentic] tool replay skipped: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/**
 * Hat dieser Thread zuletzt INFORMATION geholt?
 *
 * Dieselben Schritte, die `buildToolReplay` als Beobachtungen in den Kontext
 * spielt — die Menge ist ausdrücklich die des Replays und keine vierte
 * Werkzeugliste daneben: was als Beobachtung ankommt, ist genau das, worauf
 * eine Anschlussfrage sich beziehen kann. Nur die erzeugenden/wirkenden
 * Werkzeuge zählen nicht (`NON_REPLAYABLE_ACTION_TOOLS`): ein Thread, der ein
 * Sharepic gebaut hat, hat nichts nachgeschlagen.
 *
 * Gelesen wird die vorhandene Projektion, nicht die Datenbank — der Loop hält
 * `toolHistory` ohnehin schon in der Hand. Ohne Thread (erster Turn) ist die
 * Antwort `false`, und das ist richtig: dann gibt es keinen vorigen Turn.
 */
export function priorTurnRetrieved(toolHistory: ThreadToolHistory | null | undefined): boolean {
  if (!toolHistory) return false;
  try {
    return toolHistory
      .toolSteps()
      .some((s: PersistedStep) => !NON_REPLAYABLE_ACTION_TOOLS.has(s.toolName));
  } catch {
    return false;
  }
}

/**
 * Cross-turn source rehydration: seed the registry with the sources gathered in
 * the last research turn so a follow-up grounds against research that ran turns
 * ago — "trag die recherchierten Zahlen ein" (edit surfaces) and "erstelle ein
 * PDF mit den Originalquellen aus der Recherche" (generation).
 *
 * Complements the structured tool replay (buildToolObservationReplay), which
 * strips the [N] markers and only replays steps whose tool is mounted THIS
 * turn. This reads the persisted SearchResult[] directly, so the research
 * survives even when the search tool isn't in the current catalog.
 *
 * Seeded BEFORE the loop, so carried sources take the low citation numbers and
 * this turn's own results continue from there. They are citable — the
 * single-pass path (carryThreadSourcesIfNeeded) always cited them, and the
 * split made the same follow-up sourced or unsourced depending on nothing but
 * whether the turn routed through the loop.
 *
 * Weit offen, aber nicht mehr ungetort. Der Grundsatz bleibt: ein Thread, der
 * gerade etwas nachgeschlagen hat, soll es ein paar Nachrichten später noch
 * wissen — die Recherche mit dem Turn wegzuwerfen ist das, was einen
 * Folgeauftrag vergesslich macht. Bounded by getRecentThreadSources itself:
 * only the most recent assistant messages carrying sources, capped at 10,
 * snippets already trimmed.
 *
 * Die eine Ausnahme ist gemessen: über den 196-Turn-Korpus bekamen genau zwei
 * Turns hier fremde Recherche unter einen KÜRZUNGSAUFTRAG gelegt, weil der
 * Einzelpfad `needsThreadGrounding` fragte und der Loop niemanden. Ein
 * Kürzungsauftrag ist in dem Text gegründet, an dem er arbeitet — deshalb
 * entscheidet der Aufrufer über `rewritesSuppliedText`, ob er überhaupt fragt.
 */
export async function rehydrateCarriedSources(params: {
  threadId: string;
  sourceRegistry: SourceRegistry;
  toolHistory?: ThreadToolHistory | null;
  onInfo: (message: string) => void;
  onError: (message: string) => void;
}): Promise<void> {
  try {
    const carried = params.toolHistory
      ? params.toolHistory.sources()
      : await getRecentThreadSources(params.threadId);
    if (carried.length > 0) {
      params.sourceRegistry.seedCarried(carried);
      params.onInfo(`[Agentic] rehydrated ${carried.length} prior source(s) for grounding`);
    }
  } catch (err) {
    params.onError(
      `[Agentic] source rehydration skipped: ${err instanceof Error ? err.message : err}`
    );
  }
}

/**
 * Cards, guards, per-call timeouts, truncation and step recording — everything
 * cross-cutting the loop gets from `wrapToolsForLoop`, configured in one place
 * so no call site can mount a catalog without them.
 *
 * `TOOL_TIMEOUT_OVERRIDES_MS` is what keeps the generation tools (`create_*`)
 * alive: the generic 20s per-call budget was never reachable for a structured
 * LLM call over a long brief plus its repair attempt (see types.ts).
 */
export function wrapAssembledTools(
  tools: ToolSet,
  ctx: {
    sse: SSEWriter;
    guards: ReturnType<typeof createToolLoopGuards>;
    recordStep: (step: PersistedStep) => void;
    perCallTimeoutMs: number;
    toolLabels: Map<string, { serverName: string; toolName: string }>;
    /** Only unified mode streams answer text WHILE tools run, so its `text`
     *  length is a meaningful per-tool offset. In split mode the answer stays
     *  empty through the whole gather phase → return null so no (all-0) offsets
     *  are recorded, and reload falls back to the legacy cards-first layout. */
    getTextOffset: () => number | null;
    takeNarration: () => string | null;
  }
): ToolSet {
  return wrapToolsForLoop(tools, {
    sse: ctx.sse,
    guards: ctx.guards,
    recordStep: ctx.recordStep,
    perCallTimeoutMs: ctx.perCallTimeoutMs,
    perCallTimeoutOverridesMs: TOOL_TIMEOUT_OVERRIDES_MS,
    nearDuplicateExemptTools: NEAR_DUPLICATE_EXEMPT_TOOLS,
    getTextOffset: ctx.getTextOffset,
    takeNarration: ctx.takeNarration,
    ...(ctx.toolLabels.size > 0
      ? {
          titleFor: (name: string) => {
            const label = ctx.toolLabels.get(name);
            return label ? `${label.serverName} · ${label.toolName}…` : undefined;
          },
          serverNameFor: (name: string) => ctx.toolLabels.get(name)?.serverName,
        }
      : {}),
  });
}
