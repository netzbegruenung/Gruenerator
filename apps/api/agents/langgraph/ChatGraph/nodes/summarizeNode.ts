/**
 * Summarize Node
 *
 * Map-reduce document summarization for the ChatGraph pipeline.
 * Retrieves full document text from Qdrant and produces a structured summary.
 *
 * Strategy based on document size:
 * - < 4,000 chars:   Single-pass summary
 * - 4,000–12,000:    Single-pass with focused prompt
 * - > 12,000 chars:  Map-reduce (split → parallel summarize → combine)
 */

import { createLogger } from '../../../../utils/logger.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:Summarize');

const SINGLE_PASS_THRESHOLD = 4000;
const MAP_REDUCE_THRESHOLD = 12000;
const SEGMENT_SIZE = 6000;
const SEGMENT_OVERLAP = 200;

const SINGLE_PASS_PROMPT = `Du bist ein Zusammenfassungs-Assistent. Erstelle eine strukturierte Zusammenfassung des folgenden Dokuments.

Regeln:
- Strukturiere die Zusammenfassung mit Überschriften (##) für Hauptthemen
- Hebe wichtige Fakten, Zahlen und Positionen hervor
- Behalte die Kernaussagen und den roten Faden bei
- Max 1500 Zeichen für kurze Dokumente, max 3000 Zeichen für längere
- Auf Deutsch antworten
- Antworte NUR mit der Zusammenfassung, ohne Einleitung wie "Hier ist die Zusammenfassung"`;

const MAP_PROMPT = `Fasse den folgenden Textabschnitt präzise zusammen. Behalte alle wichtigen Fakten, Zahlen und Kernaussagen bei. Max 500 Zeichen. Antworte NUR mit der Zusammenfassung.`;

const REDUCE_PROMPT = `Kombiniere die folgenden Teilzusammenfassungen zu einer kohärenten Gesamtzusammenfassung.

Regeln:
- Strukturiere mit Überschriften (##) für Hauptthemen
- Entferne Redundanzen
- Behalte alle wichtigen Fakten und Positionen bei
- Max 3000 Zeichen
- Auf Deutsch antworten
- Antworte NUR mit der Zusammenfassung`;

const CONVERSATION_SUMMARY_PROMPT = `Fasse den folgenden Gesprächsverlauf zusammen.

Regeln:
- Nenne die Hauptthemen des Gesprächs
- Fasse die wichtigsten Fragen und Antworten zusammen
- Max 1500 Zeichen
- Auf Deutsch antworten
- Antworte NUR mit der Zusammenfassung`;

/**
 * Single-pass summarization for short/medium documents.
 */
async function singlePassSummarize(
  aiWorkerPool: any,
  title: string,
  text: string
): Promise<string> {
  const response = await aiWorkerPool.processRequest(
    {
      type: 'chat_summarize',
      provider: 'mistral',
      systemPrompt: SINGLE_PASS_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Dokument: "${title}"\n\n${text}`,
        },
      ],
      options: {
        model: 'mistral-small-latest',
        max_tokens: 1200,
        temperature: 0.2,
      },
    },
    null
  );

  return (response.content || '').trim();
}

/**
 * Split text into overlapping segments for map phase.
 */
function splitIntoSegments(text: string): string[] {
  const segments: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + SEGMENT_SIZE, text.length);
    segments.push(text.slice(start, end));

    if (end >= text.length) break;
    start = end - SEGMENT_OVERLAP;
  }

  return segments;
}

/**
 * Map-reduce summarization for long documents.
 * Splits into segments, summarizes each in parallel, then combines.
 */
async function mapReduceSummarize(aiWorkerPool: any, title: string, text: string): Promise<string> {
  const segments = splitIntoSegments(text);
  log.info(`[Summarize] Map-reduce: ${segments.length} segments from ${text.length} chars`);

  // Map phase: summarize each segment in parallel
  const mapResults = await Promise.all(
    segments.map(async (segment, i) => {
      try {
        const response = await aiWorkerPool.processRequest(
          {
            type: 'chat_summarize_map',
            provider: 'mistral',
            systemPrompt: MAP_PROMPT,
            messages: [
              {
                role: 'user',
                content: `Abschnitt ${i + 1}/${segments.length} von "${title}":\n\n${segment}`,
              },
            ],
            options: {
              model: 'mistral-small-latest',
              max_tokens: 400,
              temperature: 0.2,
            },
          },
          null
        );
        return (response.content || '').trim();
      } catch (error: any) {
        log.warn(`[Summarize] Map segment ${i + 1} failed: ${error.message}`);
        return null;
      }
    })
  );

  const validSummaries = mapResults.filter((s): s is string => !!s);

  if (validSummaries.length === 0) {
    return 'Zusammenfassung konnte nicht erstellt werden — alle Segmente sind fehlgeschlagen.';
  }

  if (validSummaries.length === 1) {
    return validSummaries[0];
  }

  // Reduce phase: combine segment summaries
  const combinedInput = validSummaries.map((s, i) => `### Teil ${i + 1}\n${s}`).join('\n\n');

  const response = await aiWorkerPool.processRequest(
    {
      type: 'chat_summarize_reduce',
      provider: 'mistral',
      systemPrompt: REDUCE_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Dokument: "${title}"\n\nTeilzusammenfassungen:\n\n${combinedInput}`,
        },
      ],
      options: {
        model: 'mistral-small-latest',
        max_tokens: 1200,
        temperature: 0.2,
      },
    },
    null
  );

  return (response.content || '').trim();
}

/**
 * Fallback: summarize conversation history when no documents are available.
 */
async function summarizeConversation(state: ChatGraphState): Promise<string> {
  const { messages, aiWorkerPool } = state;

  const recentMessages = messages.slice(-10);
  if (recentMessages.length === 0) {
    return 'Keine Nachrichten zum Zusammenfassen vorhanden.';
  }

  const conversationText = recentMessages
    .map((m) => {
      const role = m.role === 'user' ? 'Nutzer' : 'Assistent';
      const content =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .filter((p) => p && typeof p === 'object' && p.type === 'text')
                .map((p) => (p as { text: string }).text)
                .join('')
            : String(m.content || '');
      return `${role}: ${content}`;
    })
    .join('\n\n');

  const response = await aiWorkerPool.processRequest(
    {
      type: 'chat_summarize_conversation',
      provider: 'mistral',
      systemPrompt: CONVERSATION_SUMMARY_PROMPT,
      messages: [
        {
          role: 'user',
          content: conversationText,
        },
      ],
      options: {
        model: 'mistral-small-latest',
        max_tokens: 800,
        temperature: 0.2,
      },
    },
    null
  );

  return (response.content || '').trim();
}

/**
 * Summarize node entry point.
 *
 * Document source priority:
 * 1. documentChatIds (uploaded in current message, vectorized)
 * 2. documentIds (from @datei mentions)
 * 3. attachmentContext (raw text, if vectorization failed)
 * 4. Conversation history (fallback)
 */
export async function summarizeNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[Summarize] Starting document summarization');

  try {
    const { aiWorkerPool } = state;
    const userId = (state.agentConfig as any).userId;
    const docIds = [...(state.documentChatIds || []), ...(state.documentIds || [])];

    // Try retrieving full text from Qdrant
    if (docIds.length > 0 && userId) {
      try {
        const { getQdrantDocumentService } =
          await import('../../../../services/document-services/DocumentSearchService/index.js');
        const { getPostgresDocumentService } =
          await import('../../../../services/document-services/PostgresDocumentService/index.js');

        const qdrantService = getQdrantDocumentService();
        const pgService = getPostgresDocumentService();

        const bulkResult = await qdrantService.getMultipleDocumentsFullText(userId, docIds);
        const successfulDocs = bulkResult.documents.filter((d) => d.fullText.length > 0);

        if (successfulDocs.length > 0) {
          const summaries: string[] = [];

          for (const doc of successfulDocs) {
            // Get title from Postgres metadata
            let title = `Dokument ${doc.id.slice(0, 8)}`;
            try {
              const meta = await pgService.getDocumentById(doc.id, userId);
              if (meta?.title) title = meta.title;
            } catch {
              // Use fallback title
            }

            const text = doc.fullText;
            log.info(
              `[Summarize] Document "${title}": ${text.length} chars, ${doc.chunkCount} chunks`
            );

            let summary: string;
            if (text.length <= SINGLE_PASS_THRESHOLD) {
              summary = await singlePassSummarize(aiWorkerPool, title, text);
            } else if (text.length <= MAP_REDUCE_THRESHOLD) {
              summary = await singlePassSummarize(aiWorkerPool, title, text);
            } else {
              summary = await mapReduceSummarize(aiWorkerPool, title, text);
            }

            summaries.push(`## ${title}\n\n${summary}`);
          }

          const summaryContext = summaries.join('\n\n---\n\n');
          const summaryTimeMs = Date.now() - startTime;
          log.info(
            `[Summarize] Complete: ${successfulDocs.length} doc(s), ${summaryContext.length} chars in ${summaryTimeMs}ms`
          );

          return { summaryContext, summaryTimeMs };
        }

        if (bulkResult.errors.length > 0) {
          log.warn(
            `[Summarize] Qdrant retrieval errors: ${bulkResult.errors.map((e) => e.error).join(', ')}`
          );
        }
      } catch (error: any) {
        log.warn(`[Summarize] Document retrieval failed: ${error.message}`);
      }
    }

    // Fallback: use raw attachment text if available
    if (state.attachmentContext) {
      log.info('[Summarize] Using raw attachmentContext as fallback');
      const text = state.attachmentContext;
      let summary: string;

      if (text.length <= MAP_REDUCE_THRESHOLD) {
        summary = await singlePassSummarize(aiWorkerPool, 'Angehängtes Dokument', text);
      } else {
        summary = await mapReduceSummarize(aiWorkerPool, 'Angehängtes Dokument', text);
      }

      const summaryTimeMs = Date.now() - startTime;
      return { summaryContext: summary, summaryTimeMs };
    }

    // Final fallback: summarize conversation
    log.info('[Summarize] No documents found, summarizing conversation');
    const summary = await summarizeConversation(state);
    const summaryTimeMs = Date.now() - startTime;

    return { summaryContext: summary, summaryTimeMs };
  } catch (error: any) {
    log.error('[Summarize] Error:', error.message);
    const summaryTimeMs = Date.now() - startTime;

    return {
      summaryContext: `Zusammenfassung fehlgeschlagen: ${error.message}`,
      summaryTimeMs,
    };
  }
}
