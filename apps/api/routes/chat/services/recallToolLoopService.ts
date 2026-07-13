/**
 * Agentic recall loop (behind CHAT_RECALL_LOOP). For the `chat_history` intent,
 * the model drives a small multi-step loop: it SEARCHES the user's own content
 * (chats + docs/boards/sheets/presentations), sees a rough size per hit, and
 * READS only what it needs — within a budget — before answering. This keeps the
 * prompt lean (the model pulls content on demand instead of everything being
 * pre-injected) and mirrors the MCP "estimate size, then fetch" convention.
 *
 * Structure copied from sharepicAgenticService: bounded `streamText` + tools +
 * `stopWhen`, per-turn guards, compact tool results, SSE tool-step events. When
 * the flag is off the router uses the deterministic chat_history branch instead.
 */
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai';
import { z } from 'zod';

import { extractKeyParagraphs } from '../../../agents/langgraph/WebSearchGraph/utilities/contentExtractor.js';
import { loadBoardState, formatBoardAsContext } from '../../../services/boards/BoardService.js';
import { countTokens } from '../../../services/counters/TokenCounter.js';
import {
  loadPresentationState,
  formatPresentationAsContext,
} from '../../../services/presentations/PresentationGenerationService.js';
import {
  loadSheetState,
  formatSheetAsContext,
} from '../../../services/sheets/SheetGenerationService.js';
import { createLogger } from '../../../utils/logger.js';
import { loadDocumentProse } from '../../docs/docProseReader.js';
import { getModel } from '../agents/providers.js';

import { probeThreadSizes, probeOfficeSizes } from './contentSizeService.js';
import {
  recallPastChats,
  recallOfficeDocuments,
  rerankRecall,
  getThreadRecallContext,
} from './pastChatRecallService.js';
import { createLoopGuards } from './sharepicAgenticGuards.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { SSEWriter } from './sseHelpers.js';

const log = createLogger('RecallLoop');

const MAX_STEPS = 5;
const TURN_TIMEOUT_MS = 60_000;
const DEFAULT_READ_TOKENS = 1_500;
const MAX_READ_CHARS = 8_000;

export function isChatRecallLoopEnabled(): boolean {
  return process.env.CHAT_RECALL_LOOP === 'true';
}

function resolveLoopModel(): { provider: string; modelName: string } {
  return {
    provider: process.env.CHAT_RECALL_LOOP_PROVIDER || 'mistral',
    modelName: process.env.CHAT_RECALL_LOOP_MODEL || 'mistral-medium-2604',
  };
}

type RecallType = 'chat' | 'doc' | 'board' | 'sheet' | 'presentation';

function subtypeToType(subtype: string | null): Exclude<RecallType, 'chat'> {
  if (subtype === 'boards') return 'board';
  if (subtype === 'sheets') return 'sheet';
  if (subtype === 'presentations') return 'presentation';
  return 'doc';
}

interface PersistedStep {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface HandleRecallLoopArgs {
  sse: SSEWriter;
  threadId: string | null;
  userId: string;
  /** The user's recall request (raw last message text). */
  instruction: string;
  /** Optimized search query from the classifier (falls back to instruction). */
  query: string;
  startTime: number;
  classificationTimeMs?: number;
}

function buildSystemPrompt(): string {
  return [
    'Du hilfst dem*der Nutzer*in, EIGENE frühere Inhalte wiederzufinden und zu nutzen —',
    'vergangene Chats sowie eigene Dokumente, Boards, Tabellen und Präsentationen.',
    '',
    'Sprache: Du-Form, Genderstern, prägnant, Deutsch.',
    '',
    'ARBEITSWEISE:',
    '- Rufe ZUERST "search_user_content" mit dem Thema der Anfrage auf.',
    '- Jeder Treffer hat ein Feld "sizeTokens" (grobe Größe). Lies mit "read_user_content"',
    '  NUR die Treffer, die du für die Antwort wirklich brauchst — bei großen Inhalten',
    '  (hohe sizeTokens) setze "maxTokens", um nur einen relevanten Auszug zu laden.',
    '- Erfinde keine Inhalte. Beziehe dich nur auf das, was Suche/Lesen zurückgeben.',
    `- Du hast maximal ${MAX_STEPS} Schritte. Antworte am Ende IMMER in 1–4 Sätzen auf Deutsch`,
    '  und nenne die relevanten Titel (und ggf. Datum), auf die du dich beziehst.',
    '- Findet die Suche nichts Passendes, sag das ehrlich.',
  ].join('\n');
}

/**
 * Run the recall turn as an agentic tool loop. Returns true when handled (stream
 * closed); false to let the caller fall through to the deterministic branch.
 */
export async function handleRecallToolLoop(args: HandleRecallLoopArgs): Promise<boolean> {
  const { sse, threadId, userId, instruction, query } = args;
  if (!threadId) return false;

  const guards = createLoopGuards();
  const steps: PersistedStep[] = [];
  const recordStep = (
    toolCallId: string,
    toolName: string,
    input: Record<string, unknown>,
    result: Record<string, unknown>
  ) => {
    steps.push({ toolCallId, toolName, args: input, result });
  };

  try {
    sse.send('progress_step', {
      stepId: `recall_${Date.now()}`,
      toolName: 'search_chat_history',
      title: 'Durchsuche frühere Inhalte…',
      status: 'in_progress',
    });

    const tools = {
      search_user_content: tool({
        description:
          'Durchsucht die eigenen Inhalte des Nutzers (Chats, Dokumente, Boards, Tabellen, Präsentationen). Gibt Kandidaten mit id, type, title, snippet und ~sizeTokens zurück.',
        inputSchema: z.object({
          query: z.string().describe('Suchthema, ohne Aufgabenanweisung'),
          types: z
            .array(z.enum(['chat', 'doc', 'board', 'sheet', 'presentation']))
            .optional()
            .describe('Auf bestimmte Inhaltstypen einschränken (optional)'),
          limit: z.number().int().min(1).max(12).optional(),
        }),
        execute: async ({ query: q, types, limit }, { toolCallId }) => {
          const effLimit = Math.min(limit ?? 8, 12);
          const wantChat = !types || types.includes('chat');
          const wantOffice = !types || types.some((t) => t !== 'chat');
          const [rawChats, rawOffice] = await Promise.all([
            wantChat
              ? recallPastChats(userId, q, {
                  limit: effLimit,
                  ...(threadId ? { excludeThreadId: threadId } : {}),
                })
              : Promise.resolve([]),
            wantOffice ? recallOfficeDocuments(userId, q, effLimit) : Promise.resolve([]),
          ]);
          const officeFiltered = types
            ? rawOffice.filter((d) => types.includes(subtypeToType(d.subtype)))
            : rawOffice;
          const { chats, officeDocs } = await rerankRecall(q, rawChats, officeFiltered, effLimit);

          const [threadSizes, officeSizes] = await Promise.all([
            probeThreadSizes(chats.map((c) => c.threadId)),
            probeOfficeSizes(officeDocs.map((d) => d.id)),
          ]);

          const results = [
            ...chats.map((c) => ({
              id: c.threadId,
              type: 'chat' as const,
              title: c.threadTitle ?? 'Unbenannter Chat',
              snippet: c.snippet,
              sizeTokens: threadSizes.get(c.threadId) ?? countTokens(c.snippet),
            })),
            ...officeDocs.map((d) => ({
              id: d.id,
              type: subtypeToType(d.subtype),
              title: d.title ?? 'Unbenannt',
              snippet: d.snippet,
              sizeTokens: officeSizes.get(d.id) ?? countTokens(d.snippet),
            })),
          ];
          recordStep(toolCallId, 'search_user_content', { query: q }, { count: results.length });
          return { results };
        },
      }),

      read_user_content: tool({
        description:
          'Liest einen Treffer aus search_user_content vollständig (oder budgetiert). Prüfe vorher sizeTokens; bei großen Inhalten setze maxTokens, um nur einen relevanten Auszug zu laden.',
        inputSchema: z.object({
          id: z.string(),
          type: z.enum(['chat', 'doc', 'board', 'sheet', 'presentation']),
          maxTokens: z.number().int().min(200).max(4000).optional(),
        }),
        execute: async ({ id, type, maxTokens }, { toolCallId }) => {
          const guardError =
            guards.checkFailureCap('read_user_content') ??
            guards.checkDuplicate('read_user_content', { id, type });
          if (guardError) return { error: guardError };

          const budgetChars = Math.max(
            1_000,
            Math.min((maxTokens ?? DEFAULT_READ_TOKENS) * 4, MAX_READ_CHARS)
          );

          let raw: string | null = null;
          if (type === 'chat') {
            const ctx = await getThreadRecallContext(id, userId, { maxChars: budgetChars });
            raw = ctx?.transcript ?? null;
          } else if (type === 'board') {
            const b = await loadBoardState(id, userId);
            raw = b ? formatBoardAsContext(b) : null;
          } else if (type === 'sheet') {
            const s = await loadSheetState(id, userId);
            raw = s ? formatSheetAsContext(s) : null;
          } else if (type === 'presentation') {
            const p = await loadPresentationState(id, userId);
            raw = p ? formatPresentationAsContext(p) : null;
          } else {
            raw = await loadDocumentProse(id, userId);
          }

          if (raw == null || raw.trim().length === 0) {
            guards.noteFailure('read_user_content');
            recordStep(toolCallId, 'read_user_content', { id, type }, { ok: false });
            return { error: 'Inhalt nicht gefunden oder kein Zugriff.' };
          }

          const content = extractKeyParagraphs(raw, query, budgetChars);
          const sizeTokens = countTokens(content);
          recordStep(toolCallId, 'read_user_content', { id, type }, { sizeTokens });
          return { content, sizeTokens };
        },
      }),
    };

    const { provider, modelName } = resolveLoopModel();
    const messages: ModelMessage[] = [{ role: 'user', content: instruction }];

    let text = '';
    let responseStarted = false;

    const result = streamText({
      model: getModel(provider, modelName),
      system: buildSystemPrompt(),
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      temperature: 0.2,
      maxOutputTokens: 900,
      abortSignal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    });

    const iterator = result.fullStream[Symbol.asyncIterator]();
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'tool-call') {
        sse.send('tool_step_start', {
          stepId: part.toolCallId,
          toolName: part.toolName,
          args: (part.input ?? {}) as Record<string, unknown>,
        });
      } else if (part.type === 'tool-result') {
        const output = (part.output ?? {}) as Record<string, unknown>;
        const ok = !('error' in output);
        sse.send('tool_step_result', {
          stepId: part.toolCallId,
          toolName: part.toolName,
          ok,
          ...(typeof output.error === 'string'
            ? { summary: output.error }
            : typeof output.count === 'number'
              ? { summary: `${output.count} Treffer` }
              : {}),
        });
      } else if (part.type === 'text-delta' && part.text.length > 0) {
        if (!responseStarted) {
          responseStarted = true;
          sse.send('response_start', { message: 'Antwort wird erstellt...' });
        }
        text += part.text;
        sse.send('text_delta', { text: part.text });
      }
    }

    if (text.trim().length === 0) {
      text = 'Ich habe dazu nichts in deinen früheren Inhalten gefunden.';
      sse.send('response_start', { message: 'Antwort wird erstellt...' });
      sse.send('text_delta', { text });
    }

    await endTurn(args, steps, text);
    log.info(`[RecallLoop] Turn done: ${steps.length} tool step(s)`);
    return true;
  } catch (error) {
    log.error('[RecallLoop] Turn failed:', error);
    if (!sse.isEnded()) {
      const text =
        'Bei der Suche in deinen Inhalten ist etwas schiefgelaufen. Versuch es bitte noch einmal.';
      sse.send('response_start', { message: 'Antwort wird erstellt...' });
      sse.send('text_delta', { text });
      await endTurn(args, steps, text);
    }
    return true;
  }
}

async function endTurn(
  args: HandleRecallLoopArgs,
  steps: PersistedStep[],
  text: string
): Promise<void> {
  const { sse, threadId, startTime, classificationTimeMs } = args;
  sse.sendRaw('done', {
    threadId,
    citations: [],
    metadata: {
      intent: 'chat_history',
      searchCount: steps.filter((s) => s.toolName === 'search_user_content').length,
      totalTimeMs: Date.now() - startTime,
      ...(classificationTimeMs != null && { classificationTimeMs }),
      searchTimeMs: 0,
    },
  });
  if (threadId) {
    try {
      await createMessage(threadId, 'assistant', text, {
        intent: 'chat_history',
        ...(steps.length > 0 ? { toolCalls: steps as unknown as Record<string, unknown>[] } : {}),
      });
      await touchThread(threadId);
    } catch (err) {
      log.error('[RecallLoop] Failed to persist message:', err);
    }
  }
  sse.end();
}
