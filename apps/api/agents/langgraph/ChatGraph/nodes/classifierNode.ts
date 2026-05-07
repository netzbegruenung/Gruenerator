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

import { heuristicExtractFilters } from './classifierFilters.js';
import {
  heuristicClassify,
  extractSearchTopic,
  extractMessageText,
  formatConversationHistory,
  hasImageEditVerb,
  mentionsImageNoun,
  looksMultiTopic,
  HEURISTIC_CONFIDENCE_THRESHOLD,
} from './classifierHeuristics.js';
import {
  parseClassifierResponse,
  detectComplexity,
  detectSearchSources,
} from './classifierParsing.js';
import { CLASSIFIER_PROMPT, NON_SEARCH_INTENTS } from './classifierPrompt.js';

import type { ChatGraphState, GatherSource } from '../types.js';

const log = createLogger('ChatGraph:Classifier');

/**
 * Classifier node implementation.
 * Uses heuristics-first approach: high-confidence patterns skip LLM entirely.
 * Falls back to LLM for ambiguous queries where heuristics are uncertain.
 */
export async function classifierNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[Classifier] Starting intent classification');

  try {
    const { messages, aiWorkerPool } = state;

    // Extract user message content (handles both string and AI SDK v6 parts format)
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const userContent = extractMessageText(lastUserMessage?.content);

    // Format prior conversation as context for the classifier LLM
    const conversationContext = formatConversationHistory(messages);

    // Analyze temporality and complexity (used by all paths)
    const temporal = analyzeTemporality(userContent);
    const complexity = detectComplexity(userContent);

    // Resource presence flags
    const hasNotebooks = state.notebookIds && state.notebookIds.length > 0;
    const hasDocuments = state.documentIds && state.documentIds.length > 0;
    const hasDocumentChat = state.documentChatIds && state.documentChatIds.length > 0;
    const hasBoards = state.boardIds && state.boardIds.length > 0;
    const hasDocMentions = state.docMentionIds && state.docMentionIds.length > 0;
    const hasAttachmentContext = !!state.attachmentContext;
    const hasImageAttachments = state.imageAttachments && state.imageAttachments.length > 0;
    // Open document in the docs-editor is primary context, not retrieval scope.
    // Distinct from documentChatIds — we do NOT force-route to search for it.
    const hasCurrentDocument = !!state.currentDocument;
    const hasAnyDocuments =
      hasDocumentChat || hasDocuments || hasAttachmentContext || hasCurrentDocument;

    // ── TIER 1: Mutation intents (resource + action keywords) ──
    // These are the most specific signals — a user explicitly requesting a change
    // to a referenced resource. Must be checked BEFORE passive context checks,
    // otherwise an image attachment or OCR text would shadow the mutation intent.
    const boardModifyPattern =
      /\b(fuege?\s+(aufgabe|karte|eintrag)|neue\s+(karte|aufgabe)|aktualisiere\s+board|erstelle\s+aufgabe|aender|ergaenz|ueberarbeit|vereinfach|strukturier|umstrukturier|loesch|entfern|verschieb|sortier)/i;
    const docModifyPattern =
      /\b(aender|ergaenz|aktualisier|ueberarbeit|fuege?\s+hinzu|vereinfach|umschreib|kuerz|erweiter)/i;

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
    if (hasCurrentDocument && userContent.length > 0 && docModifyPattern.test(userContent)) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Live document edit detected (currentDocument set), forcing edit_current_doc intent`
      );
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
        temporal,
        complexity,
        startTime,
      });
    }

    // If file attachments were uploaded (OCR-extracted), force direct intent —
    // the respondNode already formats attachmentContext into the system message.
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

    // Image edit detection — must run BEFORE the generic image-attachment
    // short-circuit below, otherwise "bearbeite dieses Bild + image" would be
    // forced to `direct` (vision Q&A) and never reach imageEditNode.
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

    // If image attachments are present (and no edit verb above), force direct
    // intent — the vision model will interpret the image in the respond step.
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

    // If boards are mentioned (no mutation keywords — those were caught in Tier 1),
    // force direct intent so respondNode uses the board context.
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

    // If collaborative documents are mentioned (no mutation keywords — caught in Tier 1),
    // force direct intent so respondNode uses the document context.
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

    // If documents are mentioned, force search intent with LLM query optimization
    if (hasDocuments && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'Document',
        docCount: state.documentIds.length,
        aiWorkerPool,
        userContent,
        conversationContext,
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
        temporal,
        complexity,
        startTime,
        gatherSources,
      });
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
 * Helper for the 3 near-identical "force search intent with LLM query optimization" blocks.
 * Used by document chat, document mention, and notebook mention paths.
 */
async function classifyWithForcedSearch(opts: {
  reason: string;
  docCount: number;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  userContent: string;
  conversationContext: string | null;
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
    temporal,
    complexity,
    startTime,
    gatherSources,
  } = opts;

  log.info(
    `[Classifier] ${reason} detected (${docCount} item(s)), forcing search intent with LLM query optimization`
  );

  try {
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
