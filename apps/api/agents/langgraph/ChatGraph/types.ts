/**
 * ChatGraph Type Definitions
 *
 * Defines the state structure and types for the LangGraph-based chat system.
 * This provides explicit control flow for agentic chat, solving the AI SDK
 * toolChoice: 'required' loop trap.
 *
 * NOTE: req/res are intentionally NOT part of the graph state.
 * The controller handles HTTP streaming via the @ai-sdk/langchain adapter,
 * keeping the graph decoupled from transport concerns.
 */

import type { ForbiddableArtifact } from './nodes/fastPathGuards.js';
import type { SubcategoryFilters } from '../../../config/systemCollectionsConfig.js';
import type {
  NotebookEditPolicy,
  NotebookShareMode,
} from '../../../database/services/NotebookQdrantHelper.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';
import type { ArtifactKindId } from '../../../routes/chat/services/artifactKindRegistry.js';
import type { SystemMcpKey } from '../../../services/mcp/systemMcpServers.js';
import type { UserAgentInput } from '../../../services/userAgents/userAgentsRepository.js';
import type {
  WolkeFileRef,
  ConnectFileRef,
  CurrentBoard,
  ConfirmActionType,
  ChartPayload,
  ArtifactPayload,
  ComputePayload,
  SocialPostPayload,
  SearchIntent,
  ClientPlatform,
  SharepicVariant,
  PublicOwnership,
  GroupAudience,
  CreateRecurringTaskBody,
} from '@gruenerator/contracts';
import type { RoleLandesverbandInput } from '@gruenerator/shared/agents';
import type { ArtifactCreateKind } from '@gruenerator/shared/chat-intents';
import type { ModelMessage } from 'ai';
import type { RenderedMemory } from '../../../services/memory/memoryPrompt.js';

export type { WolkeFileRef, ConnectFileRef, CurrentBoard, SocialPostPayload };

/**
 * Retrieval backends the classifier can request for one turn. When several are
 * named, the search node runs them concurrently, caps each source's share of
 * the merge window, and merges/deduplicates before reranking.
 *
 * `bundestag` is also a `SearchIntent`; the two are not redundant. The intent is
 * the exclusive "this turn is DIP research" route, this is the "DIP alongside
 * the party collections" route — the pairing a question like "was sagen wir zur
 * Wärmewende und was lief dazu im Bundestag" needs, which no single intent could
 * serve. Not a wire enum (`chatStreamEvents` types it `z.array(z.string())`), so
 * adding a member is additive.
 */
export type SearchSource =
  'documents' | 'web' | 'examples' | 'chat_history' | 'wolke' | 'connect' | 'bundestag';

/**
 * Supported user locales for locale-aware collection routing.
 * Austrian users (de-AT) get Austrian collections, German users (de-DE) get German defaults.
 */
export type UserLocale = 'de-DE' | 'de-AT';

export type { ClientPlatform };

/**
 * Intent classification for routing to appropriate search tools.
 * The classifier determines which intent applies, and the graph routes
 * accordingly. Canonical value list lives in @gruenerator/contracts
 * (`searchIntentSchema`) — the single source shared with the `intent` SSE
 * wire schema and the frontend; add new intents THERE.
 */
export type { SearchIntent };

/**
 * Platform hint a user prompt can carry for social text generation. `null`
 * on the state means "generic" (no platform named). Distinct from the wire
 * `SocialPlatform` in @gruenerator/contracts, which spells generic out.
 */
export type SocialTextPlatform = 'instagram' | 'facebook' | 'twitter' | 'linkedin';

/**
 * Image style for generation.
 */
export type ImageStyle = 'illustration' | 'realistic' | 'pixel' | 'green-edit' | 'universal';

/**
 * FLUX edit-prompt builder selector for `image_edit` intent.
 * `green-edit` preserves the @stadtbegruenen branded behaviour;
 * `universal` feeds the user's instruction to FLUX as-is.
 */
export type ImageEditStyle = 'green-edit' | 'universal';

/**
 * Processed file attachment from the frontend.
 */
export interface ProcessedAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
  isImage: boolean;
}

/**
 * Image attachment for vision models.
 */
export interface ImageAttachment {
  name: string;
  type: string;
  data: string;
}

/**
 * Result from image generation.
 */
export interface GeneratedImageResult {
  base64: string;
  url: string;
  filename: string;
  prompt: string;
  style: ImageStyle;
  generationTimeMs: number;
}

/** A collaborative document (presentation / sheet / text doc) created within a
 *  turn — the shape emitted on the `document_created` SSE and persisted as
 *  message metadata (`createdDocument`) for thread-reload rehydration. `subtype`
 *  is a free string ('presentations' | 'sheets' | 'docs' | 'blank' | …) because
 *  text-doc generation picks the subtype at runtime; the SSE contract is
 *  `z.string()` too. */
export interface CreatedDocument {
  documentId: string;
  title: string;
  subtype: string;
  url: string;
}

/**
 * Thread-level memory of the tool family the last substantive turn used.
 * @mentions are stripped from the message text on send and every forcing field
 * is per-request, so a vague follow-up carries no textual trace of the tool —
 * this is the generic carrier (generalising the sticky last_mcp_server_id).
 * Written by postResponseService, injected into the classifier's LLM context.
 */
export interface ThreadToolContext {
  kind:
    | 'mcp'
    | 'image'
    | 'sharepic'
    | 'bundestag'
    | 'abgeordnetenwatch'
    | 'notebook'
    | 'presentation'
    | 'sheet'
    | 'document'
    | 'pdf'
    | 'board';
  /** Kind-specific reference (mcp: serverId, created docs: documentId, pdf: the
   *  stored `<uuid>.pdf` asset FILE NAME — deliberately not a collaborative-
   *  document UUID, which is why 'pdf' must never reach a doc-edit gate). */
  ref?: string | null;
  /** Human-readable label for prompt injection (e.g. the MCP server name). */
  label?: string | null;
}

/**
 * Source prefixes used in SearchResult.source to identify result provenance.
 * Use these instead of raw strings to avoid silent mismatches across the pipeline.
 */
export const SOURCE_PREFIX = {
  GRUENERATOR: 'gruenerator:',
  BUNDESTAG: 'bundestag',
  WEB: 'web',
  EXAMPLES: 'examples',
  RESEARCH: 'research',
  RESEARCH_SYNTHESIS: 'research_synthesis',
  DOCUMENT: 'document',
  DOCUMENT_CHAT: 'documentchat:',
  WOLKE: 'wolke:',
  CONNECT: 'connect:',
} as const;

/**
 * One retrieval failure. `reauth` marks the subset the user can actually fix
 * (an expired OAuth connection) — that needs a different message than "try
 * again later", so it must survive the trip to the emitter rather than being
 * folded into the message text.
 */
export interface SearchErrorEntry {
  source: string;
  message: string;
  reauth?: boolean;
}

/**
 * True when a searchErrors entry means a search backend was unreachable
 * (Qdrant collection, web search, whole-search catch) — as opposed to soft
 * LLM-stage failures (briefGenerator/qualityGate/rerank) that also append to
 * searchErrors but must not trigger "Quellen nicht erreichbar" messaging.
 */
export function isSourceAvailabilityError(entry: { source: string }): boolean {
  return (
    entry.source === 'web' || entry.source === 'search' || entry.source.startsWith('documents:')
  );
}

/**
 * Prefixes used for per-source failures in the multi-doc fan-out — a file the
 * user explicitly attached or @-mentioned that could not be read.
 *
 * Deliberately NOT folded into isSourceAvailabilityError: that one drives the
 * generic "die Quellensuche ist gestört" copy, while these name a specific
 * source and belong in a message that says WHICH one was missing. They were
 * collected all along and then filtered out by that predicate, so nobody ever
 * heard about them.
 */
const UNAVAILABLE_SOURCE_PREFIXES = ['wolke:', 'connect:', 'doc_mention:', 'notebook:'] as const;

export function isNamedSourceUnavailable(entry: { source: string }): boolean {
  return UNAVAILABLE_SOURCE_PREFIXES.some((p) => entry.source.startsWith(p));
}

/**
 * Split search failures into the kinds that need different wording:
 * `coreDegraded` — the search backends themselves were unreachable;
 * `unavailableSources` — specific attached/mentioned files could not be read;
 * `needsReauth` — of those, the ones the user can fix by reconnecting.
 */
export function partitionSearchErrors(errors: SearchErrorEntry[] | undefined): {
  coreDegraded: boolean;
  unavailableSources: string[];
  needsReauth: boolean;
} {
  if (!errors || errors.length === 0) {
    return { coreDegraded: false, unavailableSources: [], needsReauth: false };
  }
  const named = errors.filter(isNamedSourceUnavailable);
  return {
    coreDegraded: errors.some(isSourceAvailabilityError),
    unavailableSources: [...new Set(named.map((e) => e.source))],
    needsReauth: named.some((e) => e.reauth === true),
  };
}

/**
 * One degradation the answer must disclose.
 *
 * `code` doubles as the SSE warning code (telemetry); `modelHint` is the
 * sentence handed to the model. Keeping both on one object is what stops the
 * two channels from drifting — the user hears about exactly what was logged.
 */
export interface DegradationNote {
  code: string;
  modelHint: string;
}

/**
 * Render the notes as a system-prompt block. Returns '' when nothing degraded,
 * so callers can append unconditionally.
 */
export function renderDegradationNotes(notes: DegradationNote[] | undefined): string {
  if (!notes || notes.length === 0) return '';
  const lines = notes.map((n) => `- ${n.modelHint}`).join('\n');
  return (
    `\n\n## HINWEIS: EINGESCHRÄNKTER TURN\n\n` +
    `Folgendes hat in diesem Durchgang NICHT funktioniert:\n${lines}\n\n` +
    `Sag der*dem Nutzer*in in deiner Antwort transparent, was nicht geklappt hat. ` +
    `Behaupte NICHT, etwas sei erledigt, das fehlgeschlagen ist, und erfinde keine Ergebnisse.`
  );
}

/**
 * Unified search result structure from any tool.
 */
export interface SearchResult {
  source: string;
  title: string;
  content: string;
  url?: string | undefined;
  relevance?: number | undefined;
  contentType?: string | undefined;
  documentId?: string | undefined;
  chunkIndex?: number | undefined;
  similarityScore?: number | undefined;
  collectionId?: string | undefined;
  [key: string]: unknown;
}

/**
 * An image hit from the web search: a NAMED LINK, deliberately not a picture.
 *
 * There is no `snippet`/`content` because the engine gives none, and no thumbnail
 * because rendering one would make the user's browser request a file from an
 * arbitrary third-party host — exactly the pattern removed from the citation
 * glyphs, where a favicon fetch reported the user's IP and the source they were
 * about to read to Google. A backend proxy would change that calculus; until one
 * exists, these stay links.
 *
 * Kept out of `SearchResult` on purpose: no text means no citation, and a
 * separate type is what keeps a web image from being mistaken for usable image
 * material in the sharepic/social path.
 */
export interface WebImageResult {
  title: string;
  url: string;
  domain: string;
}

/**
 * Citation structure for response attribution.
 * Enriched with provenance data for inline popovers and grouped source cards.
 */
export interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
  citedText?: string | undefined;
  source: string;
  collectionName?: string | undefined;
  domain?: string | undefined;
  relevance?: number | undefined;
  contentType?: string | undefined;
  documentId?: string | undefined;
  chunkIndex?: number | undefined;
  similarityScore?: number | undefined;
  collectionId?: string | undefined;
  // Set when this citation came from a fan-out per-document retrieval
  // (multi-document chat). Lets the UI group source cards by referenced doc.
  documentSourceId?: string | undefined;
}

/**
 * Kind of document reference the user provided this turn.
 * Drives how the search node retrieves evidence for that source.
 */
export type DocumentSourceKind =
  | 'document' // documentIds (datei mention)
  | 'document_chat' // documentChatIds (@dokumentchat multi-select)
  | 'doc_mention' // docMentionIds (collab @doc)
  | 'notebook' // notebookIds (collection scope)
  | 'attachment' // threadAttachments (uploaded file context)
  | 'current_doc' // currentDocument (open in docs editor)
  | 'wolke' // wolkeFiles (@wolke mentionable — Nextcloud file picker)
  | 'connect'; // connectFiles (@connect mentionable — Nango-connected provider file picker)

/**
 * Normalized reference to a single document the user is working with this turn.
 * Built once at the top of classification (buildDocumentSources) and used by
 * searchNode (per-source retrieval), rerankNode (per-source budget), and
 * respondNode (labeled per-doc context blocks).
 */
export interface DocumentSource {
  kind: DocumentSourceKind;
  id: string;
  label: string;
  // For `notebook` kind: Qdrant collection keys for this notebook (a single
  // notebook can span multiple collections). Empty for non-notebook kinds.
  collectionIds?: string[] | undefined;
  // For `wolke` kind: the original share-link + path so searchNode can fetch
  // the file content via WebDAV at retrieval time.
  wolke?: WolkeFileRef | undefined;
  // For `connect` kind: the provider + fileId so searchNode can fetch the file
  // content via the matching Nango provider API client at retrieval time.
  connect?: ConnectFileRef | undefined;
}

/**
 * How respondNode should structure the answer when multiple documents are in play.
 * Picked at classification time from intent + doc count + complexity.
 *  - `table`              → markdown comparison table + short synthesis
 *  - `per_doc_bullets`    → per-doc bullets, then Unterschiede / Gemeinsamkeiten
 *  - `grounded_prose`     → narrative, but mandatory ≥1 citation per source
 *  - `null`               → unchanged single-doc / no-doc behaviour
 */
export type SynthesisMode = 'table' | 'per_doc_bullets' | 'grounded_prose' | null;

/**
 * Research tool result shape persisted into `chat_messages.tool_calls[].result`.
 * Mirrors the contract that `ResearchResultUI` reads in the chat package
 * (`packages/chat/src/components/ToolCallUI.tsx#ResearchResultUI`).
 *
 * `citations` here uses the enriched `Citation` shape (not `ResearchCitation`)
 * because the search node has already run citation enrichment on the results.
 */
export interface ResearchToolResult {
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low';
  searchSteps: Array<{ tool: string; query: string; resultsCount: number }>;
  followUpQuestions: string[];
}

/**
 * Rich examples result shape — preserves kind-specific metadata
 * (PressemitteilungExample fields for press, social-post fields for social) so
 * the chat UI's per-kind tool renderers can read the data they were designed
 * for. Persisted by `postResponseService` as the tool-call `result.examples`.
 *
 * Mirrors `DirectExamplesResult.examples` and `PressemitteilungExample` shapes
 * the existing UI cards (`PressemitteilungExamplesCard`, `ToolCallUI`) read.
 */
export interface PressExampleItem {
  id: string;
  title: string;
  body: string;
  lv: string;
  sourceId?: string;
  publishedAt?: string;
  url?: string;
}

export interface SocialExampleItem {
  id: string;
  platform: string;
  content: string;
  imageUrl?: string;
  author?: string;
  date?: string;
}

export interface ExamplesToolResult {
  press?: PressExampleItem[];
  social?: SocialExampleItem[];
  message?: string;
}

/**
 * Persisted thread attachment with summary for context in subsequent messages.
 */
export interface ThreadAttachment {
  id: string;
  name: string;
  mimeType: string;
  isImage: boolean;
  /** Full extracted document text — re-injected on follow-up turns (small docs)
   *  so the file stays chattable. Kept in sync with the DB-layer ThreadAttachment
   *  in routes/chat/services/attachmentPersistenceService.ts. */
  extractedText: string | null;
  /** Qdrant document id when a large prose doc was embedded — follow-up turns
   *  retrieve it via RAG instead of re-injecting truncated full text. */
  documentId: string | null;
  summary: string | null;
  /** Ob die Originalbytes des Anhangs gespeichert sind (`file_data`). Für PDFs
   *  ist das gleichbedeutend mit „beim Upload als ausfüllbares Formular
   *  erkannt" — siehe die DB-seitige ThreadAttachment. */
  hasFileData: boolean;
  createdAt: Date;
}

/**
 * Input to the ChatGraph.
 * Provided by the route controller when invoking the graph.
 *
 * NOTE: Does not include req/res - HTTP streaming is handled by the controller
 * using the @ai-sdk/langchain adapter.
 */
/**
 * Open document the user is currently editing — primary conversation context for
 * the docs-editor surface. Distinct from `documentChatIds` (explicit @dokumentchat
 * retrieval scope) and `attachmentContext` (uploaded files): this IS the document
 * being talked about.
 */
export interface CurrentDocument {
  id: string;
  title: string | null;
  markdown: string;
  selectionText: string | null;
}

export interface ChatGraphInput {
  messages: ModelMessage[];
  threadId?: string | undefined;
  agentId: string;
  /**
   * Owner of the request. Required to resolve user-created agents (the
   * `user_agents` table) and custom-generator agents (`cg-*`), which are keyed
   * by `(user_id, identifier)`. When omitted, only system agents resolve.
   */
  userId?: string | undefined;
  enabledTools: Record<string, boolean>;
  attachmentContext?: string | undefined;
  imageAttachments?: ImageAttachment[] | undefined;
  threadAttachments?: ThreadAttachment[] | undefined;
  /**
   * True when a tabular file (CSV/Excel/ODS) is attached this turn or earlier in
   * the thread. Steers respondNode to have the model compute via the in-browser
   * pandas interpreter (`df`) instead of doing arithmetic in its head.
   */
  hasTabularAttachment?: boolean | undefined;
  /**
   * Anzahl der aktiven eigenen Wolke-Verbindungen. Das primäre Tor für
   * `cloud_files` im Werkzeugkatalog — er wird synchron gebaut und kann die
   * Frage nicht selbst stellen. Gesetzt in `buildStreamContext` aus einem
   * 60-Sekunden-Cache; `undefined` heißt „nicht ermittelt", nicht „keine".
   */
  cloudConnectionCount?: number | undefined;
  /** THIS turn's fillable-PDF attachments (name + base64), for the PDF form
   *  tools. Needed separately from `threadAttachments`, which carries no bytes
   *  and is only written after the turn completes — on the very first turn
   *  ("here is my form, fill it in") the DB has nothing yet. */
  pdfFormAttachments?: Array<{ name: string; data: string }> | undefined;
  /**
   * True when the requesting client declared the run_python client tool
   * (clientTools includes 'run_python') — i.e. it can execute the pandas code
   * respondNode may steer the model to emit. Mobile/voice send no clientTools,
   * so their tabular guidance must not promise code execution.
   */
  clientCanRunPython?: boolean | undefined;
  /**
   * A spreadsheet result the client already computed in the browser (Pyodide).
   * Injected via formatComputedResultContext so the model treats it as ground
   * truth on follow-up turns instead of re-deriving it.
   */
  computedResult?: ComputeData | undefined;
  notebookIds?: string[] | undefined;
  /**
   * Document IDs already resolved from user-owned notebook UUIDs. The controller
   * resolves UUID notebook mentions to their backing document IDs (ownership
   * enforced there) so the graph can stay synchronous in init.
   */
  notebookDocumentIds?: string[] | undefined;
  /**
   * The user's single notebook pick from the composer (system slug). The agent's
   * own bound notebooks (`agentConfig.defaultNotebookIds`) are resolved
   * server-side in `initializeChatState` and unioned with this.
   */
  defaultNotebookId?: string | undefined;
  /**
   * Document IDs from a user-owned (UUID) notebook the user picked in the
   * composer, pre-resolved by streamContext (ownership enforced there). Unioned
   * with the agent's own bound user-notebook docs. Scopes search only when the
   * user hasn't explicitly @mentioned a notebook this turn.
   */
  defaultNotebookDocumentIds?: string[] | undefined;
  documentIds?: string[] | undefined;
  textIds?: string[] | undefined;
  documentChatIds?: string[] | undefined;
  documentChatLabels?: Record<string, string> | undefined;
  boardIds?: string[] | undefined;
  sheetIds?: string[] | undefined;
  docMentionIds?: string[] | undefined;
  wolkeFiles?: WolkeFileRef[] | undefined;
  connectFiles?: ConnectFileRef[] | undefined;
  /**
   * URLs explicitly attached in the composer via the @link mention. Merged with
   * the classifier's auto-detected URLs and crawled through the scrape_url path.
   */
  attachedWebpageUrls?: string[] | undefined;
  currentDocument?: CurrentDocument | undefined;
  currentBoard?: CurrentBoard | undefined;
  userLocale?: UserLocale | undefined;
  clientPlatform?: ClientPlatform | undefined;
  customSystemPrompt?: string | undefined;
  roleBausteinActive?: boolean | undefined;
  /**
   * Die Profilrollen der Person. Der Rezept-Katalog leitet daraus ab, welche
   * Landesverbands-Rezepte das Modell überhaupt kennen darf — dieselbe
   * Zuteilung, die Agentura und das Mention-Menü anwenden.
   */
  userRoles?: readonly RoleLandesverbandInput[] | undefined;
  activeSkillMention?: string | undefined;
  userInstructions?: string | undefined;
  contextWindowTokens?: number | undefined;
}

/**
 * Internal state during graph execution.
 * Contains input (immutable after init), intermediate results, and metadata.
 *
 * NOTE: Does not include req/res - the graph is decoupled from HTTP.
 * Streaming is handled by the controller via @ai-sdk/langchain adapter.
 */
export interface ChatGraphState {
  /**
   * The search query was inherited from a prior turn because this turn's ask was
   * referential ("recherchiere das jetzt im Web"). Caps the research confidence:
   * an inherited subject is an inference, not the user's literal question.
   */
  searchQueryInherited?: boolean | undefined;

  /**
   * The material of this turn (pasted text, attachment, open document) contains
   * instruction-shaped markers. Set by the classifier, consumed by the answer
   * prompts to warn the model BEFORE it acts — the classifier already noticed
   * such payloads and simply passed them on.
   */
  injectionSuspected?: boolean | undefined;

  /**
   * This `agentic` turn reached the loop via Tier-3.5 demotion of a RETRIEVAL
   * heuristic (web/search/examples/bundestag/…), not because the user asked
   * for open-ended work. The loop requires a first tool call on such turns —
   * without it the planner answered "Da ich in diesem Turn keine aktuellen
   * Recherche-Ergebnisse habe …" to a plain factual question it was supposed
   * to look up.
   */
  loopDemotedFromRetrieval?: boolean | undefined;

  /**
   * The LLM classifier itself said this turn needs research (`needsResearch:
   * true`) and then picked `direct` anyway. Its own reasoning gave the game
   * away live: „ist eine Web-Recherche (web) notwendig, um die aktuellen
   * Vorwürfe zu identifizieren" — followed by `intent: direct`, zero searches,
   * and an answer that invented the facts.
   *
   * Same consequence as {@link loopDemotedFromRetrieval} (a recognised
   * retrieval need that produces no tool call), different source: that one
   * comes from the Tier-3.5 heuristic demotion, this one from the model
   * contradicting itself. Kept as a separate field so the log tells you WHICH
   * of the two happened.
   */
  classifierContradictedResearch?: boolean | undefined;

  // Input (immutable after initialization)
  messages: ModelMessage[];
  threadId: string | null;
  agentConfig: AgentConfig;
  enabledTools: Record<string, boolean>;
  userLocale: UserLocale;
  /** Client shell ('web'/'app') — distinct from `platform`, the social-post target. */
  clientPlatform: ClientPlatform;
  /** Tool family the thread's last substantive turn used (see ThreadToolContext). */
  lastToolContext?: ThreadToolContext | null;
  /**
   * The thread's recent artifacts, newest first — what {@link lastToolContext}
   * would be if it were a list instead of a single slot. `last_tool_context` is
   * OVERWRITTEN by every substantive turn, so a thread that produced a document
   * and then a sharepic has forgotten the document, and "kürze die Begründung"
   * has no deterministic door back to it. Built from message metadata by
   * `listThreadArtifacts`; empty when the thread produced none.
   */
  threadArtifacts?: ThreadToolContext[];
  /** Last user text with mention tokens fully REMOVED — for regex heuristics
   *  that would false-positive on labels ("Bild generieren"). The messages on
   *  state carry the label form ("@Label") instead. */
  lastUserTextNoMentions?: string;
  /**
   * The artefact family this turn asked for AND forbade in the same breath —
   * set by the router's persistent-action gate when it demotes the intent.
   *
   * The demotion itself was silent in both directions, and that is what made it
   * dangerous. The model kept the ASK ("mach eine Präsentation") and lost the
   * TOOL, with nothing in the prompt saying why, so it helped the only way left
   * to it: on 02.08.2026 it wrote a base64 `data:`-block into the chat and told
   * the user to save it as `.pptx` (252 bytes, no ZIP central directory), then
   * — asked to fix that — invented `/office/7f9a3c2b-…`, which 404'd. The user
   * meanwhile saw a broken feature rather than an honoured instruction.
   */
  forbiddenArtifactAction?: ForbiddableArtifact | null;

  // Optional progress sink. Set by the controller for tools that produce
  // multi-phase progress (deep research). Pure callback — graph stays
  // HTTP-decoupled (no Response object on state).
  onResearchProgress?: ((message: string) => void) | undefined;

  // Attachment context
  attachmentContext: string | null;
  imageAttachments: ImageAttachment[];
  threadAttachments: ThreadAttachment[];
  hasTabularAttachment: boolean;
  /** See the input-side field: the tool-catalog gate for `cloud_files`. */
  cloudConnectionCount: number;
  /** See the input-side field: this turn's fillable PDFs, name + base64. */
  pdfFormAttachments: Array<{ name: string; data: string }>;
  clientCanRunPython: boolean;

  // Notebook scoping (from @notebook mentions)
  notebookIds: string[];
  notebookCollectionIds: string[];
  /**
   * Document IDs scoped from user-owned notebook (UUID) mentions. Used by
   * searchNode to filter Qdrant hits to documents inside the mentioned
   * personal notebook(s). Ownership is verified upstream in the controller.
   */
  notebookDocumentIds: string[];

  // Default notebook scoping (from persistent UI selection)
  defaultNotebookCollectionIds: string[];
  // Document IDs from a user-owned notebook bound to the agent as its default.
  defaultNotebookDocumentIds: string[];

  // Document scoping (from @datei mentions)
  documentIds: string[];

  // Document chat scoping (from @dokumentchat multi-select)
  documentChatIds: string[];
  // Dateiname je vektorisiertem Dokument dieses Turns (documentId → Name).
  //
  // Ein Anhang, der in DIESEM Turn hochgeladen wurde, steht noch in keiner
  // `threadAttachments`-Zeile — die entsteht erst nach der Antwort. Ohne diese
  // Karte fällt `buildDocumentSources` auf „Dokument 1" zurück, und der Name,
  // den der*die Nutzer*in gerade hochgeladen hat, taucht weder in den Quellen
  // noch in `dokumente_lesen` auf.
  documentChatLabels?: Record<string, string> | undefined;

  // Board context (from @board mentions)
  boardIds: string[];
  boardContext: string | null;

  // Sheet context (from @sheet mentions)
  sheetIds: string[];
  sheetContext: string | null;

  // Target sheet for a Tier-2.7 follow-up edit (lastToolContext pickup) — set
  // only by classifierNode's edit_sheet branch, distinct from sheetIds' @mention
  // scoping. See ChatGraphState.docMentionIds for the document equivalent.
  sheetEditId: string | null;

  // Collaborative document context (from @doc mentions)
  docMentionIds: string[];
  documentMentionContext: string | null;

  // Der Text, den der Einfache-Sprache-Agent in DIESEM Turn übertragen soll —
  // vom Router aus `resolveOriginalText` gesetzt, sonst null.
  //
  // Er existiert, damit Übertragung und Prüfung nachweislich denselben
  // Ausgangstext meinen. Ohne ihn liefen beide auseinander: der Antwortschritt
  // sieht den ganzen Thread (`formatThreadAttachmentsContext` spielt den
  // Volltext JEDES früheren Anhangs wieder ein), die Prüfkette nur den
  // aktuellen Turn. Am 13.08.2026 übertrug Schritt 1 deshalb den Artikel aus
  // dem vorigen Turn, während Schritt 3 gegen das frisch eingefügte Material
  // prüfte — der Bericht meldete folgerichtig „Halluzination, ABLEHNUNG" für
  // eine Fassung, die nur am falschen Original gemessen worden war.
  pipelineSourceText: string | null;

  // Wolke (Nextcloud) file refs selected via @wolke mentionable.
  // Downloaded + parsed inline at searchNode time; never persisted.
  wolkeFiles: WolkeFileRef[];

  // Connected-account (Nango) file refs selected via @connect mentionable.
  // Downloaded + parsed inline at searchNode time; never persisted.
  connectFiles: ConnectFileRef[];

  // URLs attached via the @link mentionable. The classifier unions these into
  // `detectedUrls` so the existing scrape_url path crawls them.
  attachedWebpageUrls: string[];

  // Current open document in the docs editor (primary context, not retrieval scope).
  // Set when chat is embedded in a document editor surface.
  currentDocument: CurrentDocument | null;

  // Live board state when chat is embedded in the boards editor surface. Primary
  // context for board Q&A; presence + edit keywords route to edit_current_board.
  currentBoard: CurrentBoard | null;

  // Custom system prompt (replaces entire agent system prompt when set)
  customSystemPrompt: string | null;

  // customSystemPrompt is a CATALOGUE role's baustein (server-side persona),
  // not a user-typed prompt. Keeps the loop's recipe self-loading mounted:
  // suppressing recipes protects user personas, not our own role bausteine.
  roleBausteinActive: boolean;

  // Profilrollen der Person. Quelle der Landesverbands-Zuteilung im
  // Rezept-Katalog: leer heißt „keine Landesgeschäftsstellen-Rolle" und damit
  // keine LV-Rezepte — dieselbe Regel wie in Agentura und im Mention-Menü.
  userRoles: readonly RoleLandesverbandInput[];

  // Mention key of the active skill (e.g. 'instagram'). When set, respondNode
  // appends the skill's `skillSystemPrompt` as an additive section.
  activeSkillMention: string | null;

  // Nachvollziehbarkeit: die Rezepte, die diesen Turn tatsächlich geformt
  // haben. Gesetzt von `buildSystemMessage` (Prompt-Tür: explizite/implizite
  // Mention oder Agent-Default) bzw. vom Loop aus der Rezept-Registry
  // (`rezept_laden`). Wandert in die `done`-Metadaten und die persistierte
  // Nachricht, damit die Oberfläche dezent ausweisen kann, welche
  // Schreibvorgabe galt.
  usedRecipes?: { mention: string; title: string; source: 'system' | 'user' }[];

  // User profile instructions (from profiles.custom_prompt, additive to all modes)
  userInstructions: string | null;

  // The person's explicit memory for this turn (services/memory). `memoryContext`
  // is the rendered, numbered text the prompt shows; `memories` is the same
  // list as data, so the `memory` tool can resolve "Nr. 3" to a row id.
  memoryContext: string | null;
  memories: RenderedMemory[] | null;
  memoryEnabled: boolean;
  memoryRetrieveTimeMs: number;

  // Chat history context (from past conversation search, injected by controller)
  chatHistoryContext: string | null;

  // Compound query detection (notebook + skill → gather-then-apply pipeline)
  isCompound: boolean;
  gatherSources: GatherSource[];

  // Multi-document chat: every document the user is referencing this turn,
  // normalized from documentIds | documentChatIds | docMentionIds | notebookIds |
  // threadAttachments | currentDocument. Source-of-truth for per-doc retrieval.
  documentSources: DocumentSource[];

  // Per-source retrieval results, keyed by DocumentSource.id. Populated by
  // searchNode when documentSources.length >= 1; consumed by rerankNode (group
  // rerank with per-source budget) and respondNode (labeled context blocks).
  perSourceResults: Record<string, SearchResult[]>;

  // How respondNode should structure the answer for multi-doc cases.
  // Null when single-doc / no-doc — preserves existing behaviour.
  synthesisMode: SynthesisMode;

  // Classification output
  intent: SearchIntent;
  secondaryIntent: SearchIntent | null;
  searchSources: SearchSource[];
  searchQuery: string | null;
  subQueries: string[] | null;
  // URLs the user pasted into the message. Set by the classifier when the active
  // agent has 'scrape' enabled; consumed by searchNode's 'scrape_url' case to crawl
  // the pages and inject their content as context/citations.
  detectedUrls: string[];
  reasoning: string;
  contentType: string | null;
  documentSubtype: string | null;
  targetGroupName: string | null;
  /**
   * What a create_* turn should be ABOUT, resolved by the classifier against the
   * conversation history.
   *
   * Single-pass generators (sharepic, image, pdf, sheet, presentation) read only
   * the last user message, so "jetzt noch ein normales sharepic" produced an
   * artifact about the instruction. The classifier already runs on exactly these
   * vague follow-ups with the history in context (`isVagueFollowup` in
   * classifierNode) — this is that call answering the question instead of the
   * subtractive word-list heuristic in referentialTopic.ts, which stays as the
   * fallback for when no LLM classification happened.
   */
  creationTopic: string | null;
  hasTemporal: boolean;
  complexity: 'simple' | 'moderate' | 'complex';

  /**
   * Output contract detected on the last user message (`detectTaskShape` in
   * routes/chat/agents/taskShape.ts): `code` for machine-readable output
   * (JSON/YAML/code/fences, incl. the sticky edit-follow-up after a code
   * answer), `strict_format` for explicitly checkable format orders ("genau
   * drei Sätze", "ohne Einleitung"). Set by the contract router after
   * classification; consumed by `resolveAutoSelection` as a lane override on
   * the neutral intents. Orthogonal to `intent` and `complexity` on purpose —
   * it describes the answer's FORM, not the task.
   */
  taskShape?: 'code' | 'strict_format' | null;

  /**
   * The user asked for a thorough/deep research in so many words — the ONLY route
   * to Linkup's expensive `deep` engine depth (`tiefenrecherche`).
   *
   * Set deterministically in the classifier's post-pass (`isExplicitDeepRequest`),
   * not by the LLM: it gates a paid setting, so it has to be inspectable and
   * testable without a model in the loop. Deliberately NOT derived from
   * `complexity` — that used to buy the deep tier, and since `detectComplexity`
   * returns `complex` for any "vergleich"/"ausführlich" in the text, the most
   * expensive engine setting had become the default for ordinary questions.
   */
  explicitDeepRequest: boolean;

  /**
   * The user typed `@deepresearch`. The ONLY route from the chat to Linkup's
   * `sourcedAnswer` endpoint, where LINKUP writes the dossier — a synthesis
   * surcharge on top of the already-expensive deep engine, hence one per day.
   *
   * Not a classifier output and not derivable from the wording: an intent a model
   * inferred cannot be a spending authorisation. Set in the router from the
   * mention token, checked against the quota in `intentExecutionService`.
   * Optional so existing state initialisations stay valid — absent means "not
   * requested", which is the safe reading.
   */
  deepResearchRequested?: boolean;

  /**
   * Linkup's finished dossier, set only when the gated `@deepresearch` path ran.
   *
   * Present means the answer is ALREADY WRITTEN and must be served verbatim: the
   * router streams it as the assistant message and skips synthesis entirely.
   * Running a model over it would paraphrase a text we already paid for, cost a
   * second LLM pass, and break the [N]↔source-order coupling this path relies on.
   */
  deepResearchAnswer?: string | null;

  /**
   * Domains the user named for THIS turn ("such auf zeit.de und orf.at"), from the
   * deterministic `extractDomainScope` heuristic — no classifier field, no prompt
   * budget.
   *
   * Deliberately not sticky. A scope that quietly keeps applying to later questions
   * is worse than none: the user sees results going missing with no way to tell
   * why. It is also visible in the tool card, so a wrong extraction is correctable
   * rather than mysterious.
   *
   * Collides with `detectedUrls` by design and loses to it: a bare domain is a
   * search restriction, a full URL with a path is a read instruction (`scrape_url`).
   */
  webSiteScope?: { include: string[]; exclude: string[] } | null;

  /**
   * The user asked to SEE images from the web this turn ("zeig mir Bilder von der
   * Demo"), from the deterministic `wantsImageResults` heuristic.
   *
   * Never a default. Image hits cost the same call but are useful on a vanishing
   * minority of turns, so a factual question must not quietly pay for pictures
   * nobody looks at. The flag has to be EARNED by an explicit ask — either this
   * heuristic or the loop's `bilder: true` argument.
   *
   * Distinct from the `image` intent, which GENERATES a picture. Same nouns,
   * different verb, different subsystem.
   */
  webWantsImages?: boolean;

  /**
   * Image hits from this turn's web search — named links, never rendered as
   * `<img>` (see `WebImageResult`).
   *
   * Deliberately its own field rather than entries in `searchResults`: an image
   * carries no text, so a source registry entry for it would be a numbered
   * citation with an empty snippet. Keeping the lists apart is also what stops
   * these from reaching the sharepic/social path, where a web image would be
   * treated as usable material rather than as research context.
   */
  webImageResults?: WebImageResult[];

  // Clarification (HITL interrupt)
  needsClarification: boolean;
  clarificationQuestion: string | null;
  clarificationOptions: string[] | null;
  /**
   * Which question was asked, when the ANSWER has to be routed rather than
   * merely used as a search topic. `graphic_kind` means "Sharepic, KI-Bild or
   * Diagramm?" — the answer names an artifact, so the resume must re-classify
   * the combined text instead of taking the generic ask_human path (which
   * rewrites `direct`/`image` to `search`).
   */
  clarificationKind?: 'graphic_kind' | undefined;

  // Metadata filters extracted by classifier (for Qdrant filtering)
  detectedFilters: SubcategoryFilters | null;

  // Search results (accumulated)
  searchResults: SearchResult[];
  citations: Citation[];
  searchCount: number;
  maxSearches: number;

  /**
   * The sources on this turn were REHYDRATED from earlier turns of this thread
   * (getRecentThreadSources) — nothing was searched now. Discriminates the one
   * case where a `direct` turn may cite [N] at all, and swaps the "claim no
   * research" honesty note for the carried-source variant. Without it the
   * prompt would hand the model a source block and a citation instruction next
   * to an order not to mention any sources.
   */
  sourcesCarriedFromThread?: boolean;

  // Research brief (compressed research intent for complex queries)
  researchBrief: string | null;

  // Rich examples result, kind-segmented (set by search node for examples /
  // pressemitteilung_examples intents). Persisted into the matching tool-call
  // `result.examples` so PressemitteilungExamplesCard can render title/body/lv
  // /url; the generic ToolCallUI also reads `examples`.
  examplesResult: ExamplesToolResult | null;

  // Quality gate (iterative search)
  qualityScore: number;
  qualityAssessmentTimeMs: number;
  topRerankScore: number | null;

  // Reliability flags & structured error log. Sources 'web' / 'search' /
  // 'documents:*' mean a search backend was unreachable; soft LLM-stage
  // failures (briefGenerator, qualityGate, rerank) also append here but say
  // nothing about source availability — filter with isSourceAvailabilityError
  // before telling anyone the sources were down.
  searchErrors: SearchErrorEntry[];
  briefGenerationFailed: boolean;
  rerankFailed: boolean;
  /** LLM classification failed and the heuristic took over — same turn, worse
   *  routing (no multi-source search, no metadata filters). */
  classifierDegraded?: boolean;

  /**
   * Degradations the ANSWER must own up to.
   *
   * A warning event is telemetry; it does not stop the model from confidently
   * presenting a degraded turn as a complete one. These notes are rendered into
   * the system prompt so the reply itself says what was missing — the same
   * mechanism the unreachable-sources block uses, generalised.
   */
  degradationNotes: DegradationNote[];

  // Image generation
  imagePrompt: string | null;
  imageStyle: ImageStyle | null;
  imageEditStyle: ImageEditStyle | null;
  generatedImage: GeneratedImageResult | null;
  imageTimeMs: number;
  imageEditDescriptions: { original: string | null; edited: string | null } | null;

  // Compound generation (agentic loop): mount signal for the generation fat
  // tools and their per-turn result (shared-ref merge, like generatedImage).
  compoundGeneration?: boolean;
  // Which generation fat tool to mount — derived from intent OR (for a demoted
  // `agentic` turn) the text noun, so "mach mir eine Tabelle draus" still mounts
  // create_sheet even though the intent is `agentic`, not `create_sheet`.
  // Die Art selbst ist die Registry-Union, nicht ein zweites handgeschriebenes
  // Literal: dieses Feld war der siebte Schreiber derselben Menge, und ein hier
  // fehlender Wert hätte im Katalog stumm kein Werkzeug montiert.
  compoundGenerationKind?: ArtifactKindId | null;
  // Compound "research + edit the OPEN doc/board" (editor sidebars): runs the
  // research loop, then emits trigger_doc_edit/trigger_board_action with the
  // gathered sources as reference material. Synth writes only a short confirm.
  compoundEdit?: boolean;
  // Tool-based editor edit: the resolved editor surface whose `edit_document`
  // tool the loop mounts. Set only for surfaces with a tool path
  // (routing.TOOL_EDIT_SURFACES); null/undefined keeps the legacy
  // trigger_doc_edit path for the still-live surfaces.
  editToolSurface?: 'doc' | 'sheet' | 'presentation' | 'board' | 'canvas' | null;
  // Human summary of edits the edit_document tool made THIS turn (set by
  // editorTools). Feeds the synth prompt so the model confirms the change in
  // past tense instead of writing empty text (→ fallback) or a false "I can't".
  editorEditsSummary?: string | null;
  sharepicVariants?: SharepicVariant[] | null;
  // Presentation/sheet/text-doc fat tool result (compound turns) — lifted by the
  // router into the persisted assistant message's `createdDocument` metadata.
  createdDocument?: CreatedDocument | null;
  // The spec the `create_pdf` tool rendered from this turn. A PDF ships as
  // finished bytes, so this is the only thing a later edit can build on —
  // lifted by postResponseService into the message's `pdfSpec` metadata.
  createdPdfSpec?: unknown;
  // Board fat tool result (compound turns) — boards have no `document_created`
  // card path, so this is lifted into the loop's `done` event (boardId +
  // boardGeneratedStructure) the way the single-pass board handler does.
  createdBoard?: { boardId: string; title: string; boardGeneratedStructure: unknown } | null;

  // Document summarization
  summaryContext: string | null;
  summaryTimeMs: number;

  // Scopes the agentic tool-loop to one connected server (its `mcp_servers.id`),
  // set by a `@notion`/`@brevo` mention (router) or a conservative classifier
  // hint. Null = run over all enabled servers.
  mcpServerScope?: string | null | undefined;

  // Das WERKZEUG, das eine @-Erwähnung dieses Turns festgezurrt hat. Gesetzt von
  // `forcedIntentStage` neben `mcpServerScope` und aus demselben Grund: der Loop
  // muss wissen, was die Person GEWÄHLT hat, und `state.intent` allein sagt das
  // nicht — ein Klassifikator-Verdikt sieht dort genauso aus.
  //
  // Zwei Leser, beide im Loop: der erste Werkzeugaufruf wird beim NAMEN genannt
  // statt nur „irgendeiner" verlangt (`pinnedFirstTool`), und der Pin selbst
  // zwingt den Turn in die Schleife (`turnPlan`) — dort und nur dort gibt es
  // Werkzeuge. Ein Werkzeugname und keine `ChatIntentId`, damit eine Erwähnung
  // eine Fähigkeit festzurren kann, deren Intent stillgelegt ist (`@umfragen`).
  // Null/abwesend = niemand hat gewählt.
  mentionPinnedTool?: string | null | undefined;

  // Die ARTEFAKTART, die eine `@…-erstellen`-Erwähnung dieses Turns festgezurrt
  // hat. Zweite Hälfte desselben Gedankens wie `mentionPinnedTool`, für die eine
  // Erwähnungsfamilie, die kein Werkzeug benennt, sondern eine Art.
  //
  // Warum sie nötig ist: keines der fünf Token setzt `forcedTool`, weil ein
  // Verbund-Turn („recherchiere X und mach eine Tabelle daraus") gerade NICHT
  // die direkte Erstellroute nehmen soll. Ohne diesen Pin leitet `turnPlan` die
  // Art dann neu aus dem Substantiv im Text ab — `@sheet-erstellen` ergab eine
  // Tabelle also nur, solange das Wort „Tabelle" auch dastand.
  mentionPinnedArtifactKind?: ArtifactCreateKind | null | undefined;

  // The first-party MANAGED connectors this turn mounts (`bahn`, `wetter`,
  // `gesetze`, …). Set by the vocabulary trigger in the router, or by an
  // explicit `@gesetze`-style mention. Empty/absent = mount none.
  //
  // A LIST, not one value, which is the whole reason these stopped being
  // intents: "Zug nach Hamburg und ein Hotel" needs two, and an intent can only
  // ever be one — the `reise` umbrella existed to work around exactly that.
  // Non-empty also OPENS the loop (see decideRunAgentic); the intent used to
  // guarantee that, and without it a telegram-style ask stays single-pass.
  managedSourceKeys?: SystemMcpKey[] | undefined;

  // Deterministic computation (set by computeNode; null when nothing computable)
  computedResult: ComputeData | null;
  computedResultTimeMs: number;
  /** True when computedResult answers THIS turn's question (run_python resume /
   *  computeNode) — respondNode then suppresses code-emission guidance. A
   *  computedResult forwarded from the previous turn (lastComputeStore) leaves
   *  this unset so a new follow-up computation can still emit code. */
  computedResultFresh?: boolean | undefined;
  /** run_python error-correction loop (OpenWebUI-style, max 1 retry): how many
   *  corrected code versions were already issued this turn, and the last code
   *  sent to the client — both survive the Redis round-trip so the resume
   *  handler can regenerate with the failure in context. */
  pandasComputeRetries?: number | undefined;
  pandasLastCode?: string | undefined;
  /** Which codegen prompt produced `pandasLastCode` — survives the Redis
   *  round-trip so a correction round regenerates openpyxl fill code for a fill
   *  request instead of silently falling back to pandas analysis code. */
  pandasComputeMode?: 'analyze' | 'fill' | undefined;
  /** Successful result stashed before a verifier-triggered correction round —
   *  if the "corrected" code then fails, the turn falls back to this instead
   *  of ending with no computation at all. */
  pandasComputeFallback?: ComputeData | undefined;

  // Chart generation
  chartData: ChartData | null;

  // Response generation
  responseText: string;
  streamingStarted: boolean;

  // Context window awareness (from model registry)
  contextWindowTokens: number;

  // Metadata for observability
  startTime: number;
  classificationTimeMs: number;
  searchTimeMs: number;
  rerankTimeMs: number;
  searchedCollections: string[];
  responseTimeMs: number;
  error: string | null;
}

/**
 * Output from the ChatGraph after completion.
 * This is what the controller receives after graph execution.
 */
export interface ChatGraphOutput {
  success: boolean;
  threadId: string | null;
  responseText: string;
  citations: Citation[];
  generatedImage?: GeneratedImageResult | null | undefined;
  metadata: {
    intent: SearchIntent;
    searchCount: number;
    totalTimeMs: number;
    classificationTimeMs: number;
    searchTimeMs: number;
    rerankTimeMs?: number | undefined;
    searchedCollections?: string[] | undefined;
    appliedFilters?: SubcategoryFilters | null | undefined;
    imageTimeMs?: number | undefined;
    memoryRetrieveTimeMs?: number | undefined;
    responseTimeMs: number;
  };
  error?: string | undefined;
}

/**
 * Gather sources for compound queries.
 * When a user combines a data source (@notebook) with a skill (@pressemitteilung),
 * the classifier returns which sources to gather context from before response generation.
 */
export type GatherSource = 'notebook-search' | 'web-search' | 'research';

/**
 * Classification result from the classifier node.
 */
export interface ClassificationResult {
  intent: SearchIntent;
  secondaryIntent?: SearchIntent | null | undefined;
  searchSources?: SearchSource[] | undefined;
  searchQuery: string | null;
  subQueries?: string[] | null | undefined;
  filters?: SubcategoryFilters | null | undefined;
  reasoning: string;
  contentType?: string | null | undefined;
  /**
   * The classifier's own verdict on whether facts have to be looked up. Was
   * requested from the model, logged once and then dropped on the floor for the
   * field's entire lifetime — see `classifierContradictedResearch` in
   * ChatGraphState for what that cost.
   */
  needsResearch?: boolean | undefined;
  /**
   * Would pictures belong beside this answer? The classifier's judgement — it is
   * the node that already reads what the turn is about, and a regex cannot tell
   * "wer war Marilyn Monroe" (a person: yes) from "wie berechne ich die
   * Grunderwerbsteuer" (a procedure: no).
   *
   * Absent whenever no LLM classification ran, which is every tier that
   * short-circuits earlier. That is why the deterministic "the user asked for
   * photos" check stays beside it instead of being replaced by it.
   */
  wantsImages?: boolean | undefined;
  needsClarification?: boolean | undefined;
  clarificationQuestion?: string | undefined;
  clarificationOptions?: string[] | undefined;
  clarificationKind?: 'graphic_kind' | undefined;
  gatherSources?: GatherSource[] | undefined;
  documentSubtype?: string | null | undefined;
  targetGroupName?: string | null | undefined;
  /** See ChatGraphState.creationTopic. Null whenever no LLM classification ran. */
  creationTopic?: string | null | undefined;
}

/**
 * Chart data for visualization (SSE `chart_data`). Derived from the canonical
 * Zod schema in @gruenerator/contracts (chatStreamEvents) — the single source of
 * truth shared with the frontend parser.
 */
export type ChartData = ChartPayload;

/**
 * Generic renderable HTML/SVG artifact (SSE `artifact`), rendered in a sandboxed
 * side panel. Derived from the canonical contracts schema — no hand-duplication.
 */
export type ArtifactData = ArtifactPayload;

/**
 * Deterministic calculation result (SSE `compute`). Produced by computeEngine in
 * plain JS — never by the LLM — and rendered as a transparent "Berechnung" card.
 * Derived from the canonical contracts schema — no hand-duplication.
 */
export type ComputeData = ComputePayload;

/**
 * Confirm action types for HITL (Human-In-The-Loop) confirmation.
 * Used when the agent wants to perform a side-effect that requires user approval.
 */
// Wire enum shared with the chat clients — single source in @gruenerator/contracts.
export type { ConfirmActionType };

/**
 * Type-safe payloads for each confirm action type.
 */
export interface SaveAsDocPayload {
  content: string;
  title: string;
  subtype: string;
}

export interface ModifyDocPayload {
  docId: string;
  newContent: string;
}

export interface ModifyBoardPayload {
  boardId: string;
  rows: Array<Record<string, unknown>>;
  responseText: string;
}

export interface ShareDocPayload {
  docId: string;
  docTitle: string;
  groupId: string;
  groupName: string;
  permissionLevel: 'viewer' | 'editor';
}

export interface CreateGroupPayload {
  name: string;
  description: string | null;
}

export interface JoinGroupPayload {
  joinToken: string;
  groupName: string;
}

/**
 * Eine Wolke-Verbindung anlegen. Der Link IST das Zugangsmittel, deshalb liegt
 * er bis zur Zustimmung nur im Redis-Pending-Eintrag und nie in einer
 * Modellantwort.
 */
export interface AddCloudConnectionPayload {
  shareLink: string;
  label: string | null;
  host: string;
  /** Einträge in der Wurzel zum Zeitpunkt der Prüfung — die Karte zeigt sie. */
  entryCount: number | null;
}

/**
 * Einen Wolke-Ordner an ein Notebook hängen und die erste Charge importieren.
 * `collectionId === null` heißt: das Notebook wird beim Bestätigen erst
 * angelegt (`create` mit `wolkeFolder`). `audience` kommt aus der Sitzung des
 * Werkzeugs, weil `executeAction` keinen Request mit Profil-Locale hat.
 */
export interface AttachWolkeFolderPayload {
  collectionId: string | null;
  notebookName: string;
  description: string | null;
  audience: UserLocale;
  shareLinkId: string;
  shareLabel: string;
  folderPath: string;
  folderName: string;
  includeSubfolders: boolean;
  /** Stand der Vorschau — die Karte zeigt sie, der Import zählt selbst neu. */
  fileCount: number;
  alreadyImported: number;
}

/** Der Patch geht unverändert an `applyNotebookVisibility`. */
export interface SetNotebookVisibilityPayload {
  collectionId: string;
  notebookName: string;
  share_mode?: NotebookShareMode;
  edit_policy?: NotebookEditPolicy;
  is_public?: boolean;
  public_ownership?: PublicOwnership | null;
}

export interface ShareNotebookPayload {
  collectionId: string;
  notebookName: string;
  groupId: string;
  groupName: string;
}

/**
 * Ein Projekt öffentlich listen oder wieder privat stellen — geht unverändert
 * an `setGroupVisibility`. Öffentlich heißt: in „Projekte entdecken" sichtbar
 * und Beitrittsanfragen möglich, deshalb eine Karte.
 */
export interface SetGroupVisibilityPayload {
  groupId: string;
  groupName: string;
  is_public: boolean;
  audience: GroupAudience;
}

/**
 * Eine wiederkehrende Aufgabe einrichten — der Body geht unverändert an
 * `createRecurringTask`. Eine Karte, weil die Aufgabe danach selbstständig
 * handelt und je Lauf kostet; `agentTitle` ist nur für die Vorschau und die
 * Bestätigungsmeldung (der Identifier allein sagt der Person nichts).
 */
export type CreateRecurringTaskPayload = CreateRecurringTaskBody & { agentTitle: string | null };

/**
 * Einen eigenen Grünerator-Agent anlegen — `input` geht unverändert an
 * `createUserAgent`. Eine Karte, weil die Rolle ein LLM-Entwurf ist, den die
 * Person vor dem Speichern sehen soll, und der Agent danach in jedem Chat mit
 * dieser Rolle handelt.
 */
export interface CreateUserAgentPayload {
  input: UserAgentInput;
}

/**
 * Einen eigenen Grünerator-Agent mit einem Projekt teilen. `agentId` ist die
 * UUID (der Schlüssel in `group_content_shares`), `identifier` und
 * `agentTitle` sind für Meldung und Link.
 */
export interface ShareUserAgentPayload {
  identifier: string;
  agentTitle: string;
  agentId: string;
  groupId: string;
  groupName: string;
}

/**
 * Pending action stored in Redis while awaiting user confirmation.
 * Discriminated union ensures type-safe payload access per action type.
 */
export type PendingAction = {
  actionId: string;
  threadId: string;
  userId: string;
  title: string;
  preview: string;
  createdAt: number;
} & (
  | { type: 'save_as_doc'; payload: SaveAsDocPayload }
  | { type: 'modify_doc'; payload: ModifyDocPayload }
  | { type: 'modify_board'; payload: ModifyBoardPayload }
  | { type: 'share_doc'; payload: ShareDocPayload }
  | { type: 'create_group'; payload: CreateGroupPayload }
  | { type: 'join_group'; payload: JoinGroupPayload }
  | { type: 'add_cloud_connection'; payload: AddCloudConnectionPayload }
  | { type: 'attach_wolke_folder'; payload: AttachWolkeFolderPayload }
  | { type: 'set_notebook_visibility'; payload: SetNotebookVisibilityPayload }
  | { type: 'share_notebook'; payload: ShareNotebookPayload }
  | { type: 'set_group_visibility'; payload: SetGroupVisibilityPayload }
  | { type: 'create_recurring_task'; payload: CreateRecurringTaskPayload }
  | { type: 'create_user_agent'; payload: CreateUserAgentPayload }
  | { type: 'share_user_agent'; payload: ShareUserAgentPayload }
);

/**
 * Chat search result from searching past conversations.
 */
export interface ChatSearchResult {
  threadId: string;
  threadTitle: string | null;
  /** Stable tail of the pretty `/chat/<slug>` URL; null for pre-backfill threads. */
  threadSlugSuffix: string | null;
  agentId: string;
  snippet: string;
  messageRole: 'user' | 'assistant';
  matchedAt: string;
  threadUpdatedAt: string;
}
