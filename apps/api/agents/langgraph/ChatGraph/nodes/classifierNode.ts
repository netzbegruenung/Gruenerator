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
  formatConversationHistory,
  hasImageEditVerb,
  mentionsImageNoun,
  looksMultiTopic,
  DOC_MODIFY_PATTERN,
  HEURISTIC_CONFIDENCE_THRESHOLD,
} from './classifierHeuristics.js';
import {
  parseClassifierResponse,
  detectComplexity,
  detectSearchSources,
} from './classifierParsing.js';
import { CLASSIFIER_PROMPT, NON_SEARCH_INTENTS } from './classifierPrompt.js';
import { classifyDocsIntentTiebreak } from './docsIntentTiebreak.js';

import type { ChatGraphState, GatherSource, SearchIntent } from '../types.js';

const log = createLogger('ChatGraph:Classifier');

// Content-creation agent (öffentlichkeitsarbeit) routing heuristics.
// Module-scope so V8 doesn't recompile per classification call. Hoisted out
// of the override block where they were originally inlined.
const PM_NOUN_PATTERN =
  /\b(pressemitteilung|pressemeldung|pm|presseaussendung|presse[-\s]?statement)\b/i;
const SOCIAL_NOUN_PATTERN =
  /\b(post|tweet|posting|reel|tiktok|instagram|facebook|linkedin|twitter|social[-\s]?media)\b/i;
const INSTAGRAM_PATTERN = /\b(instagram|insta|reel|story)\b/i;
const FACEBOOK_PATTERN = /\b(facebook|\bfb\b|fb-?post|fb-?beitrag)\b/i;

/**
 * Public classifier node — wraps the inner implementation with multi-document
 * normalization. Builds documentSources and picks synthesisMode based on the
 * classified intent + doc count, and upgrades search/research → 'compare' when
 * the user explicitly asks for a comparison and ≥2 doc sources are referenced.
 *
 * Kept as a wrapper so the inner classifier's many return paths stay focused
 * on intent/query/filters and don't each have to remember the doc-source plumbing.
 */
export async function classifierNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const result = await classifierNodeImpl(state);

  const documentSources = buildDocumentSources({
    documentIds: state.documentIds ?? [],
    documentChatIds: state.documentChatIds ?? [],
    docMentionIds: state.docMentionIds ?? [],
    notebookIds: state.notebookIds ?? [],
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

  const synthesisMode = pickSynthesisMode(intent ?? 'direct', documentSources.length);

  return {
    ...result,
    intent: intent ?? result.intent,
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
    const hasBoards = state.boardIds && state.boardIds.length > 0;
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
    const boardModifyPattern =
      /\b(fuege?\s+(aufgabe|karte|eintrag)|neue\s+(karte|aufgabe)|aktualisiere\s+board|erstelle\s+aufgabe|aender|ergaenz|ueberarbeit|vereinfach|strukturier|umstrukturier|loesch|entfern|verschieb|sortier)/i;
    const docModifyPattern = DOC_MODIFY_PATTERN;

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
        const primary: SearchIntent = wantsPm ? 'pressemitteilung_examples' : 'examples';
        const secondary: SearchIntent | null = wantsPm && wantsSocial ? 'examples' : null;
        // Platform hint for the social composer: Insta vs FB. Heuristic-only;
        // the social_media_examples Qdrant collection contains exactly these
        // two platforms, so detecting more would be misleading. Null when
        // unspecified → composer falls back to the combined rubric.
        const platform: 'instagram' | 'facebook' | null = INSTAGRAM_PATTERN.test(userContent)
          ? 'instagram'
          : FACEBOOK_PATTERN.test(userContent)
            ? 'facebook'
            : null;
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

    // ── TIER 3: Heuristic pre-check ──
    // Short messages: always use heuristics (likely greetings)
    if (userContent.length < 10) {
      const result = heuristicClassify(userContent);
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
    const heuristic = heuristicClassify(userContent);

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

    const fallbackResult = heuristicClassify(userContent);

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
 * Compact topical hint for the query optimizer so anaphoric pronouns
 * ("dazu", "dies", "darüber") can resolve to a concrete subject. Skips
 * `documentChat` — that anchor lives in its own classifier branch above.
 */
function formatTopicalContext(state: ChatGraphState): string | null {
  const lines = getActiveAnchors(state).flatMap((a): string[] => {
    switch (a.kind) {
      case 'currentDocument':
        return [`- Aktuell geöffnetes Dokument: "${a.title}"`];
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
