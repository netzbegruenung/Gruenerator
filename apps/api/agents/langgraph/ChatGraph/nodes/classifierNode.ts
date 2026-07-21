/**
 * Classifier Node
 *
 * Analyzes user messages to determine the appropriate search intent.
 * This is the entry point of the ChatGraph that routes to search or direct response.
 *
 * Uses a 4-tier decision framework:
 *   Tier 1: Mutation intents (resource + action keywords)
 *   Tier 2: Context intents (resource presence, no mutation)
 *   Tier 3: Heuristic pre-check (high confidence skips LLM)
 *   Tier 4: LLM classification (full context)
 */

import { isAgenticLoopEnabled } from '../../../../routes/chat/services/agenticLoop/flags.js';
import { looksLikeToolableQuestion } from '../../../../routes/chat/services/agenticLoop/routing.js';
import { escapeRegExp } from '../../../../services/BaseSearchService/textUtils.js';
import {
  McpServerRegistry,
  type McpClassifierServer,
} from '../../../../services/mcp/McpServerRegistry.js';
import {
  DE_ONLY_SYSTEM_INTENTS,
  SYSTEM_MCP_INTENTS,
  isSystemIntentAvailable,
} from '../../../../services/mcp/systemMcpServers.js';
import { analyzeTemporality } from '../../../../services/search/TemporalAnalyzer.js';
import { createLogger } from '../../../../utils/logger.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import { getActiveAnchors } from './anchorContext.js';
import {
  buildDocumentSources,
  hasCompareVerbs,
  pickSynthesisMode,
} from './buildDocumentSources.js';
import { heuristicExtractFilters } from './classifierFilters.js';
import {
  heuristicClassify,
  extractSearchTopic,
  extractMessageText,
  extractUrls,
  formatConversationHistory,
  hasImageEditVerb,
  mentionsImageNoun,
  looksMultiTopic,
  DOC_MODIFY_PATTERN,
  HEURISTIC_CONFIDENCE_THRESHOLD,
  detectSocialPlatform,
  resolveSocialPostEscape,
  nounNearCreateVerb,
  NOUN_TRIGGER_MAX_LENGTH,
  SOCIAL_BARE_NOUN_PATTERN,
  SOCIAL_META_QUESTION_PATTERN,
  SHAREPIC_NOUN_PATTERN,
  SHAREPIC_INCLUSION_PATTERN,
} from './classifierHeuristics.js';
import {
  parseClassifierResponse,
  detectComplexity,
  detectSearchSources,
  CHAT_HISTORY_KEYWORDS,
} from './classifierParsing.js';
import { CLASSIFIER_PROMPT, NON_SEARCH_INTENTS } from './classifierPrompt.js';
import { classifyDocsIntentTiebreak } from './docsIntentTiebreak.js';

import type { ChatGraphState, GatherSource, SearchIntent } from '../types.js';

const log = createLogger('ChatGraph:Classifier');

/** Heuristic verdicts eligible for loop demotion (Tier 3.5): the retrieval
 *  family only — every member is in AGENTIC_INTENTS and none is platform-
 *  gated. Generation intents (sharepic, social_post, image, ...) and
 *  interrupt/confirm intents must keep the LLM tier so their gates, HITL and
 *  fixed UX contracts stay intact. */
const DEMOTABLE_HEURISTIC_INTENTS: ReadonlySet<string> = new Set([
  'search',
  'web',
  'examples',
  'pressemitteilung_examples',
  'compare',
  'abgeordnetenwatch',
  'bundestag',
]);

// Content-creation agent (öffentlichkeitsarbeit) routing heuristics.
// Module-scope so V8 doesn't recompile per classification call. Hoisted out
// of the override block where they were originally inlined.
const PM_NOUN_PATTERN =
  /\b(pressemitteilung|pressemeldung|pm|presseaussendung|presse[-\s]?statement)\b/i;
const SOCIAL_NOUN_PATTERN =
  /\b(post|tweet|tweete|tweeten|posting|reel|tiktok|instagram|facebook|linkedin|twitter|social[-\s]?media)\b/i;

/**
 * Public classifier node — wraps the inner implementation with multi-document
 * normalization. Builds documentSources and picks synthesisMode based on the
 * classified intent + doc count, and upgrades search/research → 'compare' when
 * the user explicitly asks for a comparison and ≥2 doc sources are referenced.
 *
 * Kept as a wrapper so the inner classifier's many return paths stay focused
 * on intent/query/filters and don't each have to remember the doc-source plumbing.
 */
// Conservative prose routing for connected MCP servers: fire only when the
// message both names a connected service AND carries an imperative action shape,
// so statements ("Ich finde Notion super") never trigger a write-capable tool
// loop. Deliberately excludes opinion-/question-prone stems (finde, frag, welche)
// that read as commentary rather than a command.
const MCP_ACTION_PATTERN =
  /(?<![\p{L}])(erstell\w*|leg\w*|f(?:ü|ue)g\w*|hinzu|aktualisier\w*|(?:ä|ae)nder\w*|l(?:ö|oe)sch\w*|entfern\w*|hol\w*|zeig\w*|list\w*|such\w*|send\w*|schick\w*|abruf\w*|abfrag\w*|(?:ö|oe)ffn\w*|starte?|wie\s+viele?|gib\s+mir)/iu;

/**
 * Returns the id of the single connected server named in the message, or null.
 * Word-boundary match on the server name (so "Brevo-Kampagne" matches "Brevo");
 * the caller gates on MCP_ACTION_PATTERN. Ambiguous (≥2 named) → null.
 */
function matchMcpServerByName(userContent: string, servers: McpClassifierServer[]): string | null {
  const hits = servers.filter((srv) => {
    const name = srv.name.trim();
    if (name.length < 3) return false;
    return new RegExp(`(?<![\\p{L}])${escapeRegExp(name)}(?![\\p{L}])`, 'iu').test(userContent);
  });
  return hits.length === 1 ? hits[0]!.id : null;
}

export async function classifierNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const result = await classifierNodeImpl(state);

  const documentSources = buildDocumentSources({
    documentIds: state.documentIds ?? [],
    documentChatIds: state.documentChatIds ?? [],
    docMentionIds: state.docMentionIds ?? [],
    notebookIds: state.notebookIds ?? [],
    wolkeFiles: state.wolkeFiles ?? [],
    connectFiles: state.connectFiles ?? [],
    threadAttachments: state.threadAttachments ?? [],
    currentDocument: state.currentDocument ?? null,
  });

  // Upgrade search/research → 'compare' when the user explicitly asks for a
  // comparison and ≥2 doc sources are in play. Other intents (image, summary,
  // modify_doc, ...) are user-driven and shouldn't be silently rerouted.
  const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
  const userText = extractMessageText(lastUserMessage?.content);
  const COMPARE_UPGRADEABLE: ReadonlySet<SearchIntent> = new Set(['search', 'research']);
  let intent = result.intent ?? state.intent;
  if (
    intent &&
    COMPARE_UPGRADEABLE.has(intent) &&
    documentSources.length >= 2 &&
    hasCompareVerbs(userText)
  ) {
    log.info(
      `[Classifier] Compare upgrade: ${intent} → compare (${documentSources.length} doc sources, compare verbs detected)`
    );
    intent = 'compare';
  }

  // Abgeordnetenwatch covers German parliaments only (Bundestag/Landtage), not
  // the Austrian Nationalrat. For de-AT users never route here — fall back to
  // web so the question still gets answered instead of returning empty data.
  if (intent === 'abgeordnetenwatch' && state.userLocale === 'de-AT') {
    log.info('[Classifier] abgeordnetenwatch downgraded to web for de-AT locale (DE-only source)');
    intent = 'web';
  }

  // Same DE-only rule for the Bundestag DIP: it covers the Deutsche Bundestag
  // only, never the Austrian Nationalrat — downgrade to web for de-AT users.
  if (intent === 'bundestag' && state.userLocale === 'de-AT') {
    log.info('[Classifier] bundestag downgraded to web for de-AT locale (DE-only source)');
    intent = 'web';
  }

  // Conservative MCP guard: the LLM tier can return `mcp` but can't name a
  // concrete connected server. Only the deterministic name-match tier (which
  // sets mcpServerScope) or an explicit @notion/@brevo mention (resolved later
  // in the router) may run the write-capable tool loop. An unscoped prose `mcp`
  // would risk acting on the wrong server, so downgrade it to direct.
  if (intent === 'mcp' && !result.mcpServerScope) {
    log.info('[Classifier] Unscoped prose mcp intent downgraded to direct (no server named)');
    intent = 'direct';
  }

  // Downgrades to `web` must carry a query: system intents sit in
  // NON_SEARCH_INTENTS, so the parse nulled searchQuery — an un-backfilled
  // downgrade would run the web search on the empty string.
  let downgradedSearchQuery: string | null = null;

  // DE-only system sources (DB IRIS timetables, tagesschau) — de-AT users get
  // the web fallback, mirroring the abgeordnetenwatch/bundestag rule above.
  if (intent && DE_ONLY_SYSTEM_INTENTS.has(intent) && state.userLocale === 'de-AT') {
    log.info(`[Classifier] ${intent} downgraded to web for de-AT locale (DE-only source)`);
    intent = 'web';
    downgradedSearchQuery = userText;
  }

  // System MCP sources are env-gated: without the deploy env URL the intent has
  // no tools behind it — degrade so the question still gets answered (wetter/
  // news → web has a chance; a live train query without the source doesn't).
  if (intent && SYSTEM_MCP_INTENTS.has(intent) && !isSystemIntentAvailable(intent)) {
    const fallback = intent === 'bahn' ? 'direct' : 'web';
    log.info(`[Classifier] ${intent} downgraded to ${fallback} (system MCP source not configured)`);
    intent = fallback;
    if (fallback === 'web') downgradedSearchQuery = userText;
  }

  // ── URL context: pasted link(s) → additive scrape_url step ──
  // When the active agent has scraping enabled and the message contains URL(s),
  // crawl them so the page content becomes context. Additive, not exclusive:
  // a pure link paste (or a creative task whose only "search" is the link) takes
  // the scrape_url slot directly; otherwise it rides as the secondary intent so
  // "schreib einen Tweet zu <url>" both crawls the page AND drafts the tweet.
  let secondaryIntent = result.secondaryIntent ?? null;
  // Agent must allow scraping (whitelist holds 'scrape'; one agent uses the tool
  // name 'scrape_url') and the user must not have toggled it off in the composer.
  const scrapeWhitelist = state.agentConfig?.enabledTools;
  const agentAllowsScrape =
    !scrapeWhitelist ||
    scrapeWhitelist.includes('scrape') ||
    scrapeWhitelist.includes('scrape_url');
  const scrapeEnabled = agentAllowsScrape && state.enabledTools?.['scrape'] !== false;
  // @web-attached URLs are explicit user intent — union them with auto-detected
  // ones (deduped, attached first so they rank highest in scrape_url).
  const attachedUrls = scrapeEnabled ? (state.attachedWebpageUrls ?? []) : [];
  const detectedUrls = scrapeEnabled
    ? [...new Set([...attachedUrls, ...extractUrls(userText)])]
    : [];
  if (detectedUrls.length > 0) {
    if (!intent || intent === 'direct') {
      intent = 'scrape_url';
    } else if (!secondaryIntent && intent !== 'scrape_url' && intent !== 'agentic') {
      // 'agentic' turns keep secondary null: the loop has its own scrape_url
      // tool, and a secondary would kick the turn out of the loop (routing.ts).
      secondaryIntent = 'scrape_url';
    }
    log.info(
      `[Classifier] Detected ${detectedUrls.length} URL(s) → scrape_url (intent=${intent}, secondary=${secondaryIntent ?? 'none'})`
    );
  }

  const synthesisMode = pickSynthesisMode(intent ?? 'direct', documentSources.length);

  return {
    ...result,
    intent: intent ?? result.intent,
    ...(downgradedSearchQuery != null && !result.searchQuery
      ? { searchQuery: downgradedSearchQuery }
      : {}),
    secondaryIntent,
    detectedUrls,
    documentSources,
    synthesisMode,
  };
}

/**
 * Inner classifier node implementation.
 * Uses heuristics-first approach: high-confidence patterns skip LLM entirely.
 * Falls back to LLM for ambiguous queries where heuristics are uncertain.
 */
async function classifierNodeImpl(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[Classifier] Starting intent classification');

  try {
    const { messages, aiWorkerPool } = state;

    // Extract user message content (handles both string and AI SDK v6 parts format)
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const userContent = extractMessageText(lastUserMessage?.content);

    // Format prior conversation as context for the classifier LLM
    const conversationContext = formatConversationHistory(messages);

    // Topical hints from state anchors (open doc, doc-mentions, board,
    // attachments, images) so the query optimizer can resolve anaphoric
    // references like "dazu", "dies", "darüber" to a concrete subject.
    const topicalContext = formatTopicalContext(state);

    // Analyze temporality and complexity (used by all paths)
    const temporal = analyzeTemporality(userContent);
    const complexity = detectComplexity(userContent);

    // Resource presence flags
    const hasNotebooks = state.notebookIds && state.notebookIds.length > 0;
    const hasDocuments = state.documentIds && state.documentIds.length > 0;
    const hasDocumentChat = state.documentChatIds && state.documentChatIds.length > 0;
    const hasWolkeFiles = state.wolkeFiles && state.wolkeFiles.length > 0;
    const hasConnectFiles = state.connectFiles && state.connectFiles.length > 0;
    const hasBoards = state.boardIds && state.boardIds.length > 0;
    // Live board open in the boards-editor surface. Primary context, NOT a
    // retrieval mention — its id is deliberately NOT injected into boardIds, so
    // `hasBoards` stays false here and the legacy server-side modify_board path
    // cannot fire on the board page. @board mentions in /chat still hit modify_board.
    const hasCurrentBoard = !!state.currentBoard;
    // Open document in the docs-editor is primary context, not retrieval scope.
    // Distinct from documentChatIds — we do NOT force-route to search for it.
    const hasCurrentDocument = !!state.currentDocument;
    // Strip the open document from docMentionIds — when both are set for the
    // same doc, they convey the same fact. Counting the doc twice causes the
    // "Collaborative document mention → direct intent" branch below to win
    // over the "currentDocument → edit_current_doc" branch, which silently
    // drops the user's edit request. The docs-editor surface is authoritative
    // for the open doc; @-mentions of OTHER docs still flow through normally.
    const dedupedDocMentionIds = state.currentDocument?.id
      ? (state.docMentionIds ?? []).filter((id) => id !== state.currentDocument!.id)
      : (state.docMentionIds ?? []);
    const hasDocMentions = dedupedDocMentionIds.length > 0;
    const hasAttachmentContext = !!state.attachmentContext;
    const hasImageAttachments = state.imageAttachments && state.imageAttachments.length > 0;
    const hasAnyDocuments =
      hasDocumentChat || hasDocuments || hasAttachmentContext || hasCurrentDocument;

    // ── TIER 1: Mutation intents (resource + action keywords) ──
    // These are the most specific signals — a user explicitly requesting a change
    // to a referenced resource. Must be checked BEFORE passive context checks,
    // otherwise an image attachment or OCR text would shadow the mutation intent.
    // Imperative edit verbs only. Uses `-e`/`-en` imperative/infinitive endings
    // (NOT bare stems) so participles/nouns in QUESTIONS don't misfire — e.g.
    // "was wurde geändert/gelöscht/markiert?", "welche Labels gibt es?",
    // "wie ist es sortiert?" must NOT route to an edit. Noun keywords (label,
    // status, …) only count when preceded by an edit verb (füge … hinzu /
    // erstelle / setze … / weise … zu).
    // Leading `(?<![\p{L}])` (not `\b`) so umlaut-initial verbs (ändere,
    // überarbeite) match after a space — `\b` fails there since ä/ü aren't ASCII
    // word chars. `u` flag enables \p{L}.
    const boardModifyPattern =
      /(?<![\p{L}])(f(?:ü|ue)ge?\s+\S.{0,40}?\s+hinzu|neue[rs]?\s+(karte|aufgabe|spalte|feld|ansicht)|erstelle\s+\S.{0,40}?\s*(aufgabe|karte|spalte|ansicht|feld)|erstelle\s+(aufgabe|karte|spalte|ansicht|feld)|aktualisiere|(?:ä|ae)ndere|erg(?:ä|ae)nze|(?:ü|ue)berarbeite|vereinfache|(?:um)?strukturiere?|l(?:ö|oe)sche?|entferne|verschiebe|sortiere?|kommentiere|markiere|weise\s+\S.{0,40}?\s+zu\b|setze?\s+\S.{0,40}?\s+(?:f(?:ä|ae)llig|frist|status|zust(?:ä|ae)ndig|als|auf|zu\b)|setze?\s+(f(?:ä|ae)llig|frist|status|zust(?:ä|ae)ndig))/iu;
    const docModifyPattern = DOC_MODIFY_PATTERN;

    // Open board in the boards-editor surface + modification keywords → live edit
    // via the boards assistant (client-side executor on the live Yjs board). Must
    // fire before any board/doc retrieval branches. Honors the per-board
    // "AI may edit" toggle (enabledTools.edit_current_board === false).
    const editCurrentBoardAllowed = state.enabledTools?.edit_current_board !== false;
    if (
      hasCurrentBoard &&
      editCurrentBoardAllowed &&
      userContent.length > 0 &&
      boardModifyPattern.test(userContent)
    ) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(`[Classifier] Live board edit (regex fast-path) → edit_current_board`);
      return {
        intent: 'edit_current_board',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'currentBoard + modification keywords → edit_current_board',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    if (hasBoards && userContent.length > 0 && boardModifyPattern.test(userContent)) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Board mutation detected (${state.boardIds.length} board(s)), forcing modify_board intent`
      );
      return {
        intent: 'modify_board',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Board mention + modification keywords → modify_board',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // Open document in docs editor + modification keywords → live edit via
    // BlockNote AI. This MUST fire before the modify_doc branch below: a docs
    // editor surface always has currentDocument, and we want the live-edit path
    // (Yjs-synced, undoable in-place) instead of /chat's modify_doc HITL flow
    // (DB-only update, breaks Yjs).
    // Honor the docs-sidebar "AI may edit document" toggle: when the client
    // explicitly disables `edit_current_doc`, fall through to normal intent
    // classification so the assistant answers conversationally instead of
    // patching the open document.
    const editCurrentDocAllowed = state.enabledTools?.edit_current_doc !== false;

    if (hasCurrentDocument && editCurrentDocAllowed && userContent.length > 0) {
      // Layer 1: fast-path regex. Covers the common explicit-edit verbs
      // (bearbeit, verbesser, kürz, erweiter, …) with zero latency.
      if (docModifyPattern.test(userContent)) {
        const classificationTimeMs = Date.now() - startTime;
        log.info(`[Classifier] Live document edit (regex fast-path) → edit_current_doc`);
        return {
          intent: 'edit_current_doc',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'currentDocument + modification keywords → edit_current_doc',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs,
        };
      }

      // Layer 2: LLM tiebreak. Catches indirect/colloquial/multilingual
      // phrasings the regex can't ("mach das knackiger", "polish this",
      // "kannst du das anders?", "ja, mach das" as a follow-up). Hard 800ms
      // timeout, fail-safe to chat path. See docsIntentTiebreak.ts.
      const tiebreak = await classifyDocsIntentTiebreak({
        userContent,
        conversationContext,
        aiWorkerPool,
      });
      if (tiebreak === 'edit') {
        const classificationTimeMs = Date.now() - startTime;
        log.info(`[Classifier] Live document edit (LLM tiebreak) → edit_current_doc`);
        return {
          intent: 'edit_current_doc',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'currentDocument + LLM tiebreak ruled edit → edit_current_doc',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs,
        };
      }
      // tiebreak === 'question' or null → fall through to chat-path
      // classification (existing behavior).
    }

    if (hasDocMentions && userContent.length > 0 && docModifyPattern.test(userContent)) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Collaborative document mutation detected (${state.docMentionIds.length} doc(s)), forcing modify_doc intent`
      );
      return {
        intent: 'modify_doc',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Collaborative document mention + modification keywords → modify_doc',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // ── TIER 2: Context intents (resource presence, no mutation keywords) ──
    // Summary detection: when documents/attachments are present AND user asks for summary,
    // force summary intent. Without documents, "fasse zusammen" goes to LLM for disambiguation
    // (could mean web search + summarize, or conversation summary).
    const summaryPattern =
      /\b(fass[e]?\s+(das\s+|die\s+|den\s+)?(dokument\s+|datei\s+)?zusammen|zusammenfass|zusammenfassung|kurzfassung)\b/i;
    if (hasAnyDocuments && summaryPattern.test(userContent)) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(`[Classifier] Summary request with documents detected, forcing summary intent`);
      return {
        intent: 'summary',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Summary request with documents attached',
        hasTemporal: false,
        complexity: 'simple' as const,
        classificationTimeMs,
      };
    }

    // If document chat IDs are present (from @dokumentchat multi-select), force search intent
    if (hasDocumentChat && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'DocumentChat',
        docCount: state.documentChatIds.length,
        aiWorkerPool,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // Image edit detection — generation intent, exclusive. Must beat the
    // search-capable branches below so "bearbeite das Bild + @berlin" still
    // routes to imageEditNode rather than RAG.
    //
    // Two trigger patterns:
    //  1. Image attached + edit verb → image_edit (the natural-attach flow).
    //  2. No attachment but verb + image noun ("bearbeite das Foto") →
    //     image_edit anyway; the node returns the German "please attach an
    //     image" error from imageEditNode.ts:64-72.
    const editVerb = userContent.length > 0 && hasImageEditVerb(userContent);
    if (editVerb && (hasImageAttachments || mentionsImageNoun(userContent))) {
      log.info(
        `[Classifier] Image edit detected (attached=${hasImageAttachments}, noun=${mentionsImageNoun(userContent)}), forcing image_edit intent`
      );
      return {
        intent: 'image_edit',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: hasImageAttachments
          ? 'Image attachment + edit verb → image_edit'
          : 'Edit verb + image noun without attachment → image_edit (node will ask for attachment)',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Search-capable mentions take precedence over context-only branches.
    // Co-present anchors (boards / doc-mentions / files / images) still inject
    // into the system prompt via respondNode regardless of intent.

    if (hasDocuments && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'Document',
        docCount: state.documentIds.length,
        aiWorkerPool,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // @wolke selections force search intent — the wolke file content must reach
    // respondNode via perSourceResults, and that only happens inside the search path.
    if (hasWolkeFiles && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'Wolke',
        docCount: state.wolkeFiles.length,
        aiWorkerPool,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // @connect selections force search intent — the connected-account file content
    // must reach respondNode via perSourceResults, and that only happens inside the
    // search path. Mirrors the @wolke forced-search branch above.
    if (hasConnectFiles && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'Connect',
        docCount: state.connectFiles.length,
        aiWorkerPool,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // If notebooks are mentioned, force search intent with LLM query optimization.
    // Also detect compound queries: notebook + non-default agent = gather-then-apply pipeline.
    if (hasNotebooks) {
      const isNonDefaultAgent = state.agentConfig.identifier !== 'gruenerator-universal';
      const gatherSources: GatherSource[] = ['notebook-search'];

      // Empty user content after mention stripping (e.g., "@hamburg @presse")
      if (userContent.length === 0) {
        const classificationTimeMs = Date.now() - startTime;
        log.info(
          `[Classifier] Notebook mention with empty text, forcing search intent (compound: ${isNonDefaultAgent})`
        );
        return {
          intent: 'search',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'Notebook mention with empty text forces search intent',
          hasTemporal: false,
          complexity: 'simple' as const,
          classificationTimeMs,
          gatherSources,
          ...(isNonDefaultAgent ? { contentType: null } : {}),
        };
      }

      log.info(
        `[Classifier] Notebook mention detected, forcing search intent with LLM query optimization (compound: ${isNonDefaultAgent})`
      );

      return classifyWithForcedSearch({
        reason: 'Notebook',
        docCount: state.notebookIds.length,
        aiWorkerPool,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
        gatherSources,
      });
    }

    // Context-only fallback branches — fire only when no search-capable
    // mention above already routed the request.

    if (hasAttachmentContext && userContent.length > 0) {
      log.info(
        `[Classifier] File attachment detected (${state.attachmentContext!.length} chars), forcing direct intent`
      );
      return {
        intent: 'direct',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'File attachment present — respondNode will use attachmentContext',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Image attachments (no edit verb above) — vision model interprets in respond.
    if (hasImageAttachments) {
      log.info(
        `[Classifier] Image attachment detected (${state.imageAttachments.length} images), forcing direct intent`
      );
      return {
        intent: 'direct',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Image attachment present — vision model will interpret the image',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Board mentions (no mutation, no co-present search source).
    if (hasBoards && userContent.length > 0) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Board mention detected (${state.boardIds.length} board(s)), forcing direct intent`
      );
      return {
        intent: 'direct',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Board mention forces direct intent — board context injected by controller',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // Collaborative document mentions (no mutation, no co-present search source).
    if (hasDocMentions && userContent.length > 0) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Collaborative document mention detected (${state.docMentionIds.length} doc(s)), forcing direct intent`
      );
      return {
        intent: 'direct',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning:
          'Collaborative document mention forces direct intent — content injected by controller',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // Content-creation agents (e.g. öffentlichkeitsarbeit) instruct the model
    // to ground every PM / social post on real LV examples. The default
    // classifier rule routes "Schreib eine Pressemitteilung..." to `direct`,
    // which skips the search node entirely and contradicts the agent's
    // systemRole ("Nutze IMMER ..."). Force `examples` intent here so the
    // search node fires before respondNode.
    const agentWantsExamples =
      Array.isArray(state.agentConfig.enabledTools) &&
      (state.agentConfig.enabledTools.includes('examples') ||
        state.agentConfig.enabledTools.includes('pressemitteilung_examples')) &&
      /Nutze IMMER/i.test(state.agentConfig.systemRole);
    // For content-creation agents, the noun alone is enough — typical prompts
    // are bare noun-phrases like "PM zu X" or "Tweet zur Verkehrswende"
    // without an explicit creation verb. PMs and social-media posts live in
    // different Qdrant collections, so split them into two intents and use
    // secondaryIntent for mixed prompts ("Tweet UND PM zu X") so the search
    // node can fan out.
    if (agentWantsExamples && userContent.length > 0) {
      const wantsPm = PM_NOUN_PATTERN.test(userContent);
      const wantsSocial = SOCIAL_NOUN_PATTERN.test(userContent);
      if (wantsPm || wantsSocial) {
        // Social-only prompts route to the EXPERIMENTAL combined post (text +
        // sharepic) unless an escape hatch ("nur Text", "nur Sharepic")
        // applies. Mixed PM+social prompts keep the dual-search behavior.
        const socialIntent: SearchIntent = resolveSocialPostEscape(userContent) ?? 'social_post';
        const primary: SearchIntent = wantsPm ? 'pressemitteilung_examples' : socialIntent;
        const secondary: SearchIntent | null = wantsPm && wantsSocial ? 'examples' : null;
        // Platform hint for the social composer/generator. Null when
        // unspecified → generic rubric.
        const platform = detectSocialPlatform(userContent);
        log.info(
          `[Classifier] Content-creation agent (${state.agentConfig.identifier}) → primary=${primary}${secondary ? `, secondary=${secondary}` : ''}${platform ? `, platform=${platform}` : ''}`
        );
        return {
          intent: primary,
          secondaryIntent: secondary,
          platform,
          searchSources: [],
          searchQuery: extractSearchTopic(userContent) || userContent,
          detectedFilters: null,
          reasoning: `Agent ${state.agentConfig.identifier} requires ${primary}${secondary ? ` + ${secondary}` : ''} grounding for content creation`,
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // Sharepic agent is single-purpose: selecting it means the user wants a
    // sharepic. Bare topic prompts ("zur Verkehrswende") carry no sharepic
    // keyword, so the heuristic would route them to `direct` and never reach
    // sharepicGenerationService. Force the `sharepic` intent here — except for
    // obvious meta/help questions about the assistant itself, which should
    // still get a normal answer. Image attachments already returned `direct`
    // above (vision), so they never reach this branch.
    const isSharepicAgent = state.agentConfig.identifier === 'gruenerator-sharepic';
    const looksLikeMetaQuestion =
      /^\s*(wie|was|wer|warum|wieso|hilfe|help)\b/i.test(userContent) &&
      /\b(du|dich|dir|funktionier\w*|kannst|machst|bist)\b/i.test(userContent);
    if (isSharepicAgent && userContent.length >= 10 && !looksLikeMetaQuestion) {
      log.info(
        `[Classifier] Sharepic agent (${state.agentConfig.identifier}) active → forcing sharepic intent`
      );
      return {
        intent: 'sharepic',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Sharepic agent selected — routing to sharepic generation',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Bundestag agent is a dedicated DIP research assistant: selecting it means
    // the user wants Bundestag document/speech research. enabledTools only gates
    // which tools are allowed, it does not force the intent, so bare topic
    // prompts otherwise fall through to `direct` and never reach the bundestag
    // search branch. Force it here — except obvious meta/help questions. de-AT
    // never reaches this (agent is de-DE only; downgrade guard above also covers it).
    const isBundestagAgent = state.agentConfig.identifier === 'gruenerator-bundestag';
    if (
      isBundestagAgent &&
      state.userLocale !== 'de-AT' &&
      userContent.length >= 10 &&
      !looksLikeMetaQuestion
    ) {
      log.info(
        `[Classifier] Bundestag agent (${state.agentConfig.identifier}) active → forcing bundestag intent`
      );
      return {
        intent: 'bundestag',
        searchSources: [],
        searchQuery: extractSearchTopic(userContent) || userContent,
        detectedFilters: null,
        reasoning: 'Bundestag agent selected — routing to DIP research',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // EXPERIMENTAL per-server MCP prose routing: when the user names one of their
    // connected external services alongside an action ("erstelle eine Brevo-
    // Kampagne"), scope the tool-loop to that server — without needing an explicit
    // @-mention. Conservative by construction: only connected servers are known,
    // and only a name + action verb fires (see matchMcpServerByName). Runs before
    // the social-post block so "Brevo-Kampagne" isn't misrouted to social_post.
    // Gate the DB/cache lookup behind the cheap action-verb regex so the
    // overwhelmingly common no-action message never touches the servers table.
    const mcpUserId = state.agentConfig?.userId;
    if (mcpUserId && userContent.length >= 8 && MCP_ACTION_PATTERN.test(userContent)) {
      const servers = await McpServerRegistry.getClassifierContext(mcpUserId).catch(() => []);
      const scopedServerId = matchMcpServerByName(userContent, servers);
      if (scopedServerId) {
        log.info('[Classifier] MCP prose routing → mcp intent', { scope: scopedServerId });
        return {
          intent: 'mcp',
          mcpServerScope: scopedServerId,
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'Connected MCP service named with an action — routing to tool loop',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // EXPERIMENTAL combined social post — for ALL users, not just
    // content-creation agents: a social-post creation request yields text +
    // sharepic variants in one turn. Requires a bare noun-phrase shape
    // ("Instagram-Post zu Tempo 30", ^-anchored, so valid even before a long
    // paste) or a creation verb NEAR a social noun in a short message —
    // "schreibe eine Produktvorstellung … [Paste erwähnt Instagram]" must not
    // pair the instruction's verb with a noun inside pasted material.
    // Questions and example-browsing never create. Explicit sharepic wording
    // ("Sharepic für Instagram") keeps the shipped sharepic-only flow, "nur
    // Text" the examples flow — both via resolveSocialPostEscape. PM prompts
    // keep their own routes (handled above for agents, LLM tier otherwise).
    const isLongPaste = userContent.length > NOUN_TRIGGER_MAX_LENGTH;
    const looksLikeSocialCreation =
      SOCIAL_NOUN_PATTERN.test(userContent) &&
      !PM_NOUN_PATTERN.test(userContent) &&
      !SOCIAL_META_QUESTION_PATTERN.test(userContent) &&
      !looksLikeMetaQuestion &&
      (SOCIAL_BARE_NOUN_PATTERN.test(userContent) ||
        (!isLongPaste && nounNearCreateVerb(userContent, SOCIAL_NOUN_PATTERN)));
    if (looksLikeSocialCreation && userContent.length >= 10) {
      if (
        SHAREPIC_NOUN_PATTERN.test(userContent) &&
        !SHAREPIC_INCLUSION_PATTERN.test(userContent)
      ) {
        // "Sharepic für Instagram" — let the heuristic/LLM tiers route to the
        // sharepic intent as before this feature. Inclusion phrasing
        // ("Post mit Sharepic") stays here: it's the explicit combined ask.
        log.info('[Classifier] Social creation with explicit sharepic wording — deferring');
      } else {
        const escape = resolveSocialPostEscape(userContent);
        const intent: SearchIntent = escape ?? 'social_post';
        const platform = detectSocialPlatform(userContent);
        log.info(
          `[Classifier] Social post creation → ${intent}${platform ? ` (platform=${platform})` : ''}${escape ? ' via escape hatch' : ''}`
        );
        return {
          intent,
          platform,
          searchSources: [],
          searchQuery: extractSearchTopic(userContent) || userContent,
          detectedFilters: null,
          reasoning: escape
            ? `Social post request with "${escape}" escape hatch`
            : 'Social post creation — combined text + sharepic (experimental)',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // ── TIER 3: Heuristic pre-check ──
    // Short messages: always use heuristics (likely greetings)
    if (userContent.length < 10) {
      const result = heuristicClassify(userContent, {
        hasTabularAttachment: state.hasTabularAttachment ?? false,
      });
      log.info(
        `[Classifier] Short message, heuristics: ${result.intent} (confidence: ${result.confidence.toFixed(2)})`
      );
      return {
        intent: result.intent,
        searchSources: [],
        searchQuery: result.searchQuery,
        detectedFilters: null,
        reasoning: result.reasoning,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Try heuristics first - check confidence
    const heuristic = heuristicClassify(userContent, {
      hasTabularAttachment: state.hasTabularAttachment ?? false,
    });

    // Penalize confidence for multi-topic search queries → forces LLM decomposition
    const isSearchIntent = !NON_SEARCH_INTENTS.has(heuristic.intent);
    const needsDecomposition = isSearchIntent && looksMultiTopic(userContent);

    // Penalize confidence for vague follow-ups in multi-turn conversations →
    // forces LLM path which now has conversation context for query enrichment
    const isVagueFollowup = conversationContext && userContent.split(/\s+/).length <= 8;

    const effectiveConfidence =
      heuristic.confidence - (needsDecomposition ? 0.3 : 0) - (isVagueFollowup ? 0.25 : 0);

    if (needsDecomposition) {
      log.info(
        `[Classifier] Multi-topic detected, forcing LLM (${heuristic.confidence.toFixed(2)} → ${effectiveConfidence.toFixed(2)})`
      );
    }
    if (isVagueFollowup) {
      log.info(
        `[Classifier] Vague follow-up in conversation, forcing LLM (${heuristic.confidence.toFixed(2)} → ${effectiveConfidence.toFixed(2)})`
      );
    }

    // High confidence: skip LLM, use heuristics directly
    if (effectiveConfidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      const classificationTimeMs = Date.now() - startTime;

      // Apply query optimization for search intents
      let optimizedQuery = heuristic.searchQuery;
      if (heuristic.searchQuery && !NON_SEARCH_INTENTS.has(heuristic.intent)) {
        const extracted = extractSearchTopic(heuristic.searchQuery);
        if (extracted !== heuristic.searchQuery) {
          log.debug(
            `[Classifier] Heuristic query optimized: "${heuristic.searchQuery}" → "${extracted}"`
          );
          optimizedQuery = extracted;
        }
      }

      const heuristicSearchSources = detectSearchSources(userContent, heuristic.intent);
      const heuristicFilters = heuristicExtractFilters(userContent);
      if (heuristicFilters) {
        log.debug(`[Classifier] Heuristic filters: ${JSON.stringify(heuristicFilters)}`);
      }
      log.info(
        `[Classifier] Heuristics (confidence: ${heuristic.confidence.toFixed(2)}): ${heuristic.intent} - ${heuristic.reasoning}${heuristicSearchSources.length > 1 ? ` [multi-source: ${heuristicSearchSources.join('+')}]` : ''}`
      );
      return {
        intent: heuristic.intent,
        searchSources: heuristicSearchSources,
        searchQuery: optimizedQuery?.slice(0, 500) || null,
        detectedFilters: heuristicFilters,
        reasoning: `${heuristic.reasoning} (heuristic, confidence: ${heuristic.confidence.toFixed(2)})`,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // ── TIER 3.5: Loop demotion ──
    // A low-confidence but TOOLABLE verdict skips the LLM call (~800ms) and
    // hands the turn to the agentic loop, whose model picks the tools itself.
    // Only retrieval-shaped intents demote — generation/platform-gated intents
    // (sharepic, social_post, image, ...) and chat-recall phrasings keep the
    // LLM tier so their gates/HITL/routing stay intact.
    const demotable =
      isAgenticLoopEnabled() &&
      (DEMOTABLE_HEURISTIC_INTENTS.has(heuristic.intent) ||
        (heuristic.intent === 'direct' && looksLikeToolableQuestion(userContent))) &&
      !CHAT_HISTORY_KEYWORDS.test(userContent);
    if (demotable) {
      log.info(
        `[Classifier] Loop demotion: heuristic ${heuristic.intent}@${effectiveConfidence.toFixed(2)} < ${HEURISTIC_CONFIDENCE_THRESHOLD} → agentic (LLM skipped)`
      );
      return {
        intent: 'agentic',
        searchSources: detectSearchSources(userContent, heuristic.intent),
        searchQuery: (heuristic.searchQuery ?? userContent).slice(0, 500),
        detectedFilters: heuristicExtractFilters(userContent),
        reasoning: `Loop demotion: heuristic ${heuristic.intent}@${effectiveConfidence.toFixed(2)} below threshold`,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // ── TIER 4: LLM classification ──
    log.debug(
      `[Classifier] Low heuristic confidence (${heuristic.confidence.toFixed(2)}), using LLM`
    );

    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_intent_classification',
        provider: INTERMEDIATE_MODEL.provider,
        systemPrompt: CLASSIFIER_PROMPT,
        messages: [
          {
            role: 'user',
            content: conversationContext
              ? `${conversationContext}\n\nAktuelle Nachricht: "${userContent}"`
              : `Analysiere: "${userContent}"`,
          },
        ],
        options: {
          model: INTERMEDIATE_MODEL.model,
          max_tokens: 250,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    // Parse the response
    const classification = parseClassifierResponse(response.content || '', userContent);
    const classificationTimeMs = Date.now() - startTime;

    // Use LLM searchSources if provided, otherwise fall back to heuristic detection
    const llmSearchSources = classification.searchSources?.length
      ? classification.searchSources
      : detectSearchSources(userContent, classification.intent);

    if (classification.filters) {
      log.info(`[Classifier] LLM filters: ${JSON.stringify(classification.filters)}`);
    }
    log.info(
      `[Classifier] LLM: ${classification.intent} in ${classificationTimeMs}ms - ${classification.reasoning}${llmSearchSources.length > 1 ? ` [multi-source: ${llmSearchSources.join('+')}]` : ''}${classification.needsClarification ? ' [needs-clarification]' : ''}`
    );

    return {
      intent: classification.intent,
      secondaryIntent: classification.secondaryIntent || null,
      // The LLM JSON schema carries no platform field — recover it here so
      // social asks that miss the fast path (long paste, verbose phrasing)
      // still get the platform-specific composer rubric.
      platform: classification.intent === 'social_post' ? detectSocialPlatform(userContent) : null,
      searchSources: llmSearchSources,
      searchQuery: classification.searchQuery?.slice(0, 500) || null,
      subQueries: classification.subQueries || null,
      detectedFilters: classification.filters || null,
      reasoning: classification.reasoning,
      contentType: classification.contentType || null,
      documentSubtype: classification.documentSubtype || null,
      targetGroupName: classification.targetGroupName || null,
      hasTemporal: temporal.hasTemporal,
      complexity,
      classificationTimeMs,
      needsClarification: classification.needsClarification || false,
      clarificationQuestion: classification.clarificationQuestion || null,
      clarificationOptions: classification.clarificationOptions || null,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[Classifier] Error:', errorMessage);

    // Fallback to heuristic classification
    const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
    const userContent = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

    const fallbackResult = heuristicClassify(userContent, {
      hasTabularAttachment: state.hasTabularAttachment ?? false,
    });

    return {
      intent: fallbackResult.intent,
      searchSources: [],
      searchQuery: fallbackResult.searchQuery,
      detectedFilters: null,
      reasoning: `Heuristic fallback (error: ${errorMessage})`,
      hasTemporal: false,
      complexity: 'moderate' as const,
      classificationTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Compact topic hint from the open document so the query optimizer can resolve
 * anaphora like "dieses Dokument" to a concrete subject. Heuristic only (no LLM)
 * — the classifier path is latency-sensitive. Caps the excerpt so it stays a
 * hint, not a full document dump.
 */
function extractDocumentTopicHint(
  currentDocument: NonNullable<ChatGraphState['currentDocument']>
): string {
  const excerpt = currentDocument.markdown
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → label text
    .replace(/[#>*_`~|-]/g, ' ') // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  const title = currentDocument.title?.trim();
  if (title) return `"${title}" — ${excerpt}`;
  return excerpt || 'das geöffnete Dokument';
}

/**
 * Compact topical hint for the query optimizer so anaphoric pronouns
 * ("dazu", "dies", "darüber", "dieses Dokument") can resolve to a concrete
 * subject. Skips `documentChat` — that anchor lives in its own classifier
 * branch above.
 */
function formatTopicalContext(state: ChatGraphState): string | null {
  const lines = getActiveAnchors(state).flatMap((a): string[] => {
    switch (a.kind) {
      case 'currentDocument':
        return state.currentDocument
          ? [
              `- Aktuell geöffnetes Dokument — Inhalt: "${extractDocumentTopicHint(state.currentDocument)}"`,
            ]
          : [];
      case 'documentMention':
        return [`- Referenzierte Dokumente: ${a.titles.map((t) => `"${t}"`).join(', ')}`];
      case 'board':
        return ['- Ein Board ist referenziert (siehe Boardkontext im Gespräch).'];
      case 'attachment':
        return ['- Hochgeladene Datei(en) liegen vor.'];
      case 'image':
        return [`- Bilder angehängt: ${a.names.join(', ')}`];
      case 'documentChat':
        return [];
    }
  });

  if (lines.length === 0) return null;
  return `Themenkontext (zur Auflösung von "dazu", "dies" etc.):\n${lines.join('\n')}`;
}

/**
 * Helper for the 3 near-identical "force search intent with LLM query optimization" blocks.
 * Used by document chat, document mention, and notebook mention paths.
 */
async function classifyWithForcedSearch(opts: {
  reason: string;
  docCount: number;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  userContent: string;
  conversationContext: string | null;
  topicalContext: string | null;
  temporal: { hasTemporal: boolean };
  complexity: 'simple' | 'moderate' | 'complex';
  startTime: number;
  gatherSources?: GatherSource[];
}): Promise<Partial<ChatGraphState>> {
  const {
    reason,
    docCount,
    aiWorkerPool,
    userContent,
    conversationContext,
    topicalContext,
    temporal,
    complexity,
    startTime,
    gatherSources,
  } = opts;

  log.info(
    `[Classifier] ${reason} detected (${docCount} item(s)), forcing search intent with LLM query optimization${topicalContext ? ' + topical context' : ''}`
  );

  try {
    const userMessageContent = [
      topicalContext,
      conversationContext,
      `Aktuelle Nachricht: "${userContent}"`,
    ]
      .filter((p): p is string => !!p)
      .join('\n\n');

    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_intent_classification',
        provider: INTERMEDIATE_MODEL.provider,
        systemPrompt: CLASSIFIER_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessageContent || `Analysiere: "${userContent}"`,
          },
        ],
        options: {
          model: INTERMEDIATE_MODEL.model,
          max_tokens: 250,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    const classification = parseClassifierResponse(response.content || '', userContent);
    const classificationTimeMs = Date.now() - startTime;
    const optimizedQuery = classification.searchQuery || extractSearchTopic(userContent);

    log.info(`[Classifier] ${reason} + LLM: query "${userContent}" → "${optimizedQuery}"`);

    return {
      intent: 'search',
      secondaryIntent: classification.secondaryIntent || null,
      searchSources: [],
      searchQuery: optimizedQuery,
      subQueries: classification.subQueries || null,
      detectedFilters: classification.filters || null,
      reasoning: `${reason} forces search intent; LLM optimized query`,
      hasTemporal: temporal.hasTemporal,
      complexity,
      classificationTimeMs,
      documentSubtype: classification.documentSubtype || null,
      targetGroupName: classification.targetGroupName || null,
      ...(gatherSources ? { gatherSources } : {}),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.warn(
      `[Classifier] LLM failed for ${reason.toLowerCase()} query, using heuristic: ${errorMessage}`
    );
    const optimizedQuery = extractSearchTopic(userContent);
    return {
      intent: 'search',
      searchSources: [],
      searchQuery: optimizedQuery || userContent,
      detectedFilters: heuristicExtractFilters(userContent),
      reasoning: `${reason} forces search intent (LLM failed, heuristic fallback)`,
      hasTemporal: temporal.hasTemporal,
      complexity,
      classificationTimeMs: Date.now() - startTime,
      ...(gatherSources ? { gatherSources } : {}),
    };
  }
}

// Re-export all test-facing symbols for backward compatibility
export {
  heuristicClassify,
  fuzzyMatchIntent,
  extractSearchTopic,
  extractMessageText,
  formatConversationHistory,
  looksMultiTopic,
  INTENT_KEYWORDS,
  HEURISTIC_CONFIDENCE_THRESHOLD,
  detectContentType,
} from './classifierHeuristics.js';

export type { HeuristicResult } from './classifierHeuristics.js';

export {
  extractFilters,
  heuristicExtractFilters,
  LANDESVERBAND_ALIASES,
} from './classifierFilters.js';

export type { ClassifierLLMResponse } from './classifierFilters.js';

export {
  parseClassifierResponse,
  detectComplexity,
  detectSearchSources,
} from './classifierParsing.js';
