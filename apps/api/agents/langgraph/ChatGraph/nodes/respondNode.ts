/**
 * Respond Node
 *
 * Prepares the response context with search results and system instructions.
 * Does NOT stream directly - streaming is handled by the controller using AI SDK v6.
 *
 * This separation keeps the graph transport-agnostic and testable.
 */

import { createLogger } from '../../../../utils/logger.js';

import type { ChatGraphState, ThreadAttachment } from '../types.js';

const log = createLogger('ChatGraph:Respond');

/**
 * Attachment context limits.
 * These prevent large documents from consuming the entire token budget.
 */
const ATTACHMENT_LIMITS = {
  PER_DOCUMENT_CHARS: 8000, // ~2000 tokens per document
  TOTAL_BUDGET_CHARS: 20000, // ~5000 tokens total for all attachments
};

/**
 * Smart document truncation.
 * Keeps the introduction (60%) and conclusion (40%) for better context.
 * Documents typically have important info at the start and end.
 */
function truncateDocument(
  text: string,
  limit: number = ATTACHMENT_LIMITS.PER_DOCUMENT_CHARS
): string {
  if (!text || text.length <= limit) return text;

  // Smart truncation: keep intro (60%) + conclusion (40%)
  const introLength = Math.floor(limit * 0.6);
  const outroLength = limit - introLength - 60; // 60 chars for marker

  const intro = text.slice(0, introLength);
  const outro = text.slice(-outroLength);

  const removedChars = text.length - limit;
  return `${intro}\n\n[...${removedChars.toLocaleString('de-DE')} Zeichen gekürzt...]\n\n${outro}`;
}

/**
 * Apply total budget limit to already-formatted attachment context.
 * Parses individual documents and truncates as needed.
 */
function limitAttachmentContext(
  context: string,
  budget: number = ATTACHMENT_LIMITS.TOTAL_BUDGET_CHARS
): string {
  if (!context || context.length <= budget) return context;

  // Parse documents by the ### header pattern
  const docPattern = /^### .+$/gm;
  const docMatches = [...context.matchAll(docPattern)];

  if (docMatches.length === 0) {
    // No structured documents found, just truncate the whole thing
    return truncateDocument(context, budget);
  }

  // Split into individual documents
  const documents: { header: string; content: string }[] = [];
  for (let i = 0; i < docMatches.length; i++) {
    const startIdx = docMatches[i].index!;
    const endIdx = i < docMatches.length - 1 ? docMatches[i + 1].index! : context.length;
    const fullDoc = context.slice(startIdx, endIdx);
    const header = docMatches[i][0];
    const content = fullDoc.slice(header.length).trim();
    documents.push({ header, content });
  }

  // Apply per-document limit and total budget
  let totalChars = 0;
  const limited: string[] = [];
  let omittedCount = 0;

  for (const doc of documents) {
    if (totalChars >= budget) {
      omittedCount++;
      continue;
    }

    const remaining = budget - totalChars;
    const perDocLimit = Math.min(ATTACHMENT_LIMITS.PER_DOCUMENT_CHARS, remaining);
    const truncated = truncateDocument(doc.content, perDocLimit);

    limited.push(`${doc.header}\n${truncated}`);
    totalChars += truncated.length + doc.header.length + 1;
  }

  if (omittedCount > 0) {
    limited.push(
      `\n[${omittedCount} weitere(s) Dokument(e) nicht einbezogen wegen Kontextbeschränkung]`
    );
    log.info(`[Attachment] Omitted ${omittedCount} documents due to context budget`);
  }

  const result = limited.join('\n\n---\n\n');

  if (result.length < context.length) {
    log.info(`[Attachment] Truncated context: ${context.length} → ${result.length} chars`);
  }

  return result;
}

/**
 * Total character budget for search context (~1000 tokens).
 * Distributed proportionally by relevance score across top results.
 * Increases to 6000 when crawled full content is available.
 */
const SEARCH_CONTEXT_BUDGET = 4000;
const SEARCH_CONTEXT_BUDGET_CRAWLED = 6000;
const MAX_SEARCH_RESULTS = 8;

const FINDINGS_CLEANING_PROMPT = `Du bist ein Forschungsassistent. Fasse die folgenden Suchergebnisse zu einem kohärenten Überblick zusammen, fokussiert auf den Recherche-Auftrag.

Regeln:
- Strukturierte Zusammenfassung (max 1500 Zeichen)
- Verweise auf die Quellen beibehalten (Titel in **Fettschrift**)
- Wichtige Fakten, Zahlen und Positionen hervorheben
- Redundante Informationen zusammenfassen
- Auf Deutsch antworten

Antworte NUR mit der Zusammenfassung, ohne Einleitung.`;

const MAX_CLEANED_FINDINGS_LENGTH = 2000;

/**
 * Clean and summarize search results using Mistral-small.
 * Returns a coherent findings summary or null on failure.
 */
async function cleanFindings(state: ChatGraphState): Promise<string | null> {
  const { searchResults, researchBrief, searchQuery, aiWorkerPool } = state;

  const topResults = searchResults.slice(0, 6);
  const resultsText = topResults
    .map((r, i) => `[${i + 1}] **${r.title}**\n${r.content.slice(0, 500)}`)
    .join('\n\n');

  const brief = researchBrief || searchQuery || '';

  const response = await aiWorkerPool.processRequest(
    {
      type: 'chat_clean_findings',
      provider: 'mistral',
      systemPrompt: FINDINGS_CLEANING_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Recherche-Auftrag: ${brief}\n\nSuchergebnisse:\n${resultsText}\n\nErstelle eine strukturierte Zusammenfassung.`,
        },
      ],
      options: {
        model: 'mistral-small-latest',
        max_tokens: 600,
        temperature: 0.2,
      },
    },
    null
  );

  const cleaned = (response.content || '').trim();
  if (!cleaned) return null;

  return cleaned.slice(0, MAX_CLEANED_FINDINGS_LENGTH);
}

/**
 * Format search results as context for the response generation.
 * Uses budget-based allocation weighted by relevance score.
 * Results with fullContent (crawled) get 2x weight in budget allocation.
 *
 * For complex research queries with a researchBrief, uses LLM cleaning
 * to produce a coherent summary instead of raw truncated snippets.
 */
async function formatSearchContext(state: ChatGraphState): Promise<string> {
  if (state.searchResults.length === 0) {
    return '';
  }

  // Complex research: try LLM-cleaned findings
  if (state.complexity === 'complex' && state.researchBrief && state.aiWorkerPool) {
    try {
      const cleaned = await cleanFindings(state);
      if (cleaned) {
        log.info(`[Respond] Using cleaned findings (${cleaned.length} chars)`);
        return `\n\n## RECHERCHE-ERGEBNISSE\n\n${cleaned}`;
      }
    } catch (error: any) {
      log.warn(
        `[Respond] Findings cleaning failed, falling back to budget truncation: ${error.message}`
      );
    }
  }

  // Default: budget-based truncation
  const topResults = state.searchResults.slice(0, MAX_SEARCH_RESULTS);

  // Detect if any results have crawled content (longer than typical snippets)
  const hasCrawledContent = topResults.some((r) => r.content.length > 500);
  const budget = hasCrawledContent ? SEARCH_CONTEXT_BUDGET_CRAWLED : SEARCH_CONTEXT_BUDGET;

  // Crawled results get 2x weight in budget allocation
  const weightedRelevance = topResults.map((r) => {
    const base = r.relevance || 0.5;
    const crawlBoost = r.content.length > 500 ? 2 : 1;
    return base * crawlBoost;
  });
  const totalWeightedRelevance = weightedRelevance.reduce((sum, w) => sum + w, 0);

  const resultsText = topResults
    .map((r, i) => {
      const charBudget = Math.max(
        200,
        Math.floor((weightedRelevance[i] / totalWeightedRelevance) * budget)
      );
      const content =
        r.content.length > charBudget ? truncateDocument(r.content, charBudget) : r.content;
      return `[${i + 1}] **${r.title}**\n${content}`.trim();
    })
    .join('\n\n');

  return `\n\n## SUCHERGEBNISSE\n\n${resultsText}`;
}

/**
 * Format attachment context for the response generation.
 * Applies truncation limits to prevent context explosion with large documents.
 */
function formatAttachmentContext(state: ChatGraphState): string {
  if (!state.attachmentContext) {
    return '';
  }

  // Apply truncation limits to prevent context explosion
  const limitedContext = limitAttachmentContext(state.attachmentContext);

  return `

## ANGEHÄNGTE DOKUMENTE

Der Nutzer hat Dokumente angehängt. Hier ist der extrahierte Text:

${limitedContext}

---
Beantworte Fragen zu den Dokumenten basierend auf deren Inhalt.`;
}

/**
 * Format thread attachments (from previous messages) as context.
 * Only includes document summaries, not full text (for token efficiency).
 */
function formatThreadAttachmentsContext(attachments: ThreadAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return '';
  }

  const docs = attachments
    .filter((a) => !a.isImage && a.summary)
    .map((a, i) => `${i + 1}. **${a.name}**: ${a.summary}`)
    .join('\n');

  if (!docs) {
    return '';
  }

  return `

## FRÜHERE DOKUMENTE IN DIESEM GESPRÄCH

${docs}

---
Nutze diese Dokumentinhalte wenn der Nutzer sich darauf bezieht (z.B. "das PDF", "das Dokument", etc.).`;
}

/**
 * Format memory context from mem0 cross-thread memories.
 * These are persistent facts and preferences about the user.
 */
function formatMemoryContext(memoryContext: string | null): string {
  if (!memoryContext || memoryContext.trim() === '') {
    return '';
  }

  return `

## ERINNERUNGEN AN DIESEN NUTZER

Du hast folgende Informationen über diesen Nutzer aus früheren Gesprächen:

${memoryContext}

---
Berücksichtige diese Informationen bei deiner Antwort, aber erwähne sie nur wenn relevant.`;
}

/**
 * Build the complete system message with agent role and search context.
 */
export async function buildSystemMessage(state: ChatGraphState): Promise<string> {
  const { agentConfig, intent, threadAttachments, memoryContext } = state;
  const searchContext = await formatSearchContext(state);
  const attachmentContext = formatAttachmentContext(state);
  const threadAttachmentsContext = formatThreadAttachmentsContext(threadAttachments);
  const memoryContextFormatted = formatMemoryContext(memoryContext);

  const intentGuidance =
    intent === 'direct'
      ? '\nDies ist eine direkte Anfrage ohne Recherche-Bedarf. Antworte natürlich und hilfsbereit.'
      : '\nDu hast Recherche-Ergebnisse erhalten. Nutze sie um eine fundierte Antwort zu geben.';

  const hasSources = state.searchResults.length > 0 && intent !== 'direct';
  const citationInstruction = hasSources
    ? `
5. Verwende Inline-Quellenverweise [1], [2], etc. direkt nach Aussagen die auf Suchergebnissen basieren
6. Nummeriere die Quellen in der Reihenfolge ihres Erscheinens in den SUCHERGEBNISSEN
7. Setze die Referenz direkt nach der Aussage, z.B.: "Die Grünen fordern ein Tempolimit [1]."`
    : '';

  return `${agentConfig.systemRole}${intentGuidance}${memoryContextFormatted}${threadAttachmentsContext}${attachmentContext}${searchContext}

## ANTWORT-REGELN
1. Beantworte NUR was gefragt wurde - keine ungebetene Zusatzinfo
2. Kurze, präzise Antworten (max 3-4 Absätze für einfache Fragen)
3. Antworte auf Deutsch
4. Erfinde keine Fakten oder Quellennamen${citationInstruction}`;
}

/**
 * Respond node implementation.
 *
 * This node prepares the context for response generation but does NOT stream.
 * The controller handles streaming using AI SDK v6's streamText + toDataStreamResponse.
 *
 * Returns:
 * - systemMessage: The complete system prompt with search context
 * - readyToStream: Flag indicating the graph has completed preparation
 */
export async function respondNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info(
    `[Respond] Preparing response context (intent: ${state.intent}, results: ${state.searchResults.length})`
  );

  try {
    // Build system message with search context (async for complex research cleaning)
    const systemMessage = await buildSystemMessage(state);

    const responseTimeMs = Date.now() - startTime;
    log.info(`[Respond] Context prepared in ${responseTimeMs}ms`);

    // Return the prepared context - streaming happens in controller
    return {
      responseText: systemMessage, // Store system message for controller to use
      streamingStarted: false, // Will be set true by controller when streaming starts
      responseTimeMs,
    };
  } catch (error: any) {
    log.error('[Respond] Error preparing context:', error.message);

    return {
      responseText: '',
      responseTimeMs: Date.now() - startTime,
      error: `Response preparation failed: ${error.message}`,
    };
  }
}
