/**
 * Welcher Antwortmodus ein Turn der Notebook-Seite fährt: `chat` (die
 * Notebook-RAG-Pipeline) oder `praezision` (der agentische Loop mit
 * `notebook_quellen`, gesperrt auf die Notebooks der Seite).
 *
 * Reihenfolge:
 * 1. Kein Feld → chat (`default`) — alte Mobile-Binaries, Eval, Grün-O-Mat.
 *    `chat` → chat (`explicit`).
 * 2. Kein Notebook der Seite, das `notebook_quellen` lesen kann → chat
 *    (`ineligible`); bei ausdrücklicher Präzision mit Warnung.
 * 3. `praezision` → praezision (`explicit`).
 * 4. `auto`: ein Werkzeugauftrag, den `looksLikeNotebookToolAsk` erkennt und
 *    der nichts schreiben will → praezision ohne LLM (`pregate`). Sonst
 *    entscheidet ein kleiner LLM-Wächter (`guard`); Fehler, Zeitüberschreitung
 *    oder unlesbare Antwort → chat (`guard_fallback`). Im Zweifel chat: der
 *    Loop ist um ein Vielfaches teurer als die RAG-Pipeline.
 */
import { isUserNotebookId } from '../../../config/notebookCollectionMap.js';
import { aiText } from '../../../services/ai/generate.js';
import { resolveSystemCollection } from '../../../services/notebook/systemNotebookSources.js';
import { recordDecision, type BranchOf } from '../../../utils/decisionJournal.js';
import { createLogger } from '../../../utils/logger.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { collectionsForLocale } from '../agents/searchTools.js';

import { looksLikeNotebookToolAsk, looksLikeNotebookWriteAsk } from './notebookToolAsk.js';

import type {
  ChatWarningCode,
  NotebookAnswerMode,
  NotebookAnswerModeEvent,
  NotebookResolvedAnswerMode,
} from '@gruenerator/contracts';

const log = createLogger('NotebookAnswerMode');

/** Wie `docsIntentTiebreak`: ~300 ms gemessen, Luft für einen Fallback-Sprung. */
const GUARD_TIMEOUT_MS = 1500;
/** Die letzten zwei Wechsel (Frage + Antwort) reichen für eine Folgefrage. */
const GUARD_HISTORY_MESSAGES = 4;
const GUARD_ANSWER_CHARS = 300;

const GUARD_PROMPT = `Du bist ein Klassifizierer auf der Notebook-Seite von Grünerator. Die Nutzer*in stellt eine Frage an die Quellen ihrer Notebooks.

Entscheide, wie die letzte Nachricht beantwortet wird:

CHAT: Inhaltsfragen an die Quellen — was steht drin, zusammenfassen, erklären, vergleichen, Positionen und Argumente herausarbeiten. Beantwortet aus passenden Textstellen.

PRAEZISION: Arbeit direkt mit den Quellen als Dokumenten — Quellen auflisten, zählen oder sortieren, eine bestimmte Seite, einen Abschnitt oder ein Kapitel lesen, wörtliche Häufigkeiten ("wie oft kommt X vor"), ein Zitat wörtlich prüfen, vollständige Listen über alle Quellen.

Eine Folgefrage ("und die zweite?", "weiter", "noch genauer") übernimmt den Modus der vorigen Antwort.

Im Zweifel: chat.

Antworte mit GENAU einem Wort: chat oder praezision.`;

/** Ein Eintrag des Verlaufs, so weit der Wächter ihn braucht. */
export interface NotebookGuardTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Der Modus, in dem eine frühere Antwort lief (nur Antworten, sonst null). */
  answerMode: NotebookResolvedAnswerMode | null;
}

export interface NotebookAnswerModeInput {
  /** `answerMode` aus dem Request; null, wenn er keines trug. */
  requested: NotebookAnswerMode | null;
  /** Die Notebooks der Seite (`collectionIds`, sonst `[collectionId]`). */
  collectionIds: readonly string[];
  userLocale: string | null;
  /** Die aktuelle Frage (Text der letzten Nutzer-Nachricht). */
  question: string;
  /** Verlauf VOR der aktuellen Frage, älteste zuerst (siehe `notebookGuardHistory`). */
  history: readonly NotebookGuardTurn[];
}

export interface NotebookAnswerModeResolution {
  decision: NotebookAnswerModeEvent;
  warning: Extract<ChatWarningCode, 'notebook_praezision_unavailable'> | null;
}

/**
 * Kann der Loop mindestens ein Notebook der Seite lesen? Ein eigenes
 * Notebook, oder ein System-Notebook aus EINER Sammlung, die der Locale
 * zusteht. Die Seite schickt System-Ids (`berlin-system`), nicht die Slugs
 * des Chats (`berlin-notebook`) — deshalb `resolveSystemCollection`, das
 * Schlüssel, System-Id und Slug kennt, wie `notebook_quellen` selbst.
 */
export function isPraezisionEligible(
  collectionIds: readonly string[],
  userLocale: string | null
): boolean {
  const allowed = collectionsForLocale(userLocale);
  return collectionIds.some((id) => {
    const system = resolveSystemCollection(id, allowed);
    if (system) return !('error' in system);
    return isUserNotebookId(id);
  });
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) =>
      part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''
    )
    .join('');
}

/**
 * Die letzten zwei Wechsel vor der aktuellen Frage aus der Wire-History. Die
 * letzte Nutzer-Nachricht IST die Frage und fällt weg; Antworten tragen ihren
 * `answerMode`, wenn der Client ihn mitschickt.
 */
export function notebookGuardHistory(
  messages: readonly { role: string; content?: unknown; answerMode?: unknown }[]
): NotebookGuardTurn[] {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') {
      lastUser = i;
      break;
    }
  }
  const before = lastUser >= 0 ? messages.slice(0, lastUser) : messages;
  const turns: NotebookGuardTurn[] = [];
  for (const m of before) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = messageText(m.content).trim();
    if (!content) continue;
    turns.push({
      role: m.role,
      content,
      answerMode:
        m.role === 'assistant' && (m.answerMode === 'chat' || m.answerMode === 'praezision')
          ? m.answerMode
          : null,
    });
  }
  return turns.slice(-GUARD_HISTORY_MESSAGES);
}

export function formatGuardPrompt(question: string, history: readonly NotebookGuardTurn[]): string {
  const lines = history.slice(-GUARD_HISTORY_MESSAGES).map((t) => {
    if (t.role === 'user') return `Nutzer*in: ${t.content}`;
    const text =
      t.content.length > GUARD_ANSWER_CHARS
        ? `${t.content.slice(0, GUARD_ANSWER_CHARS)}…`
        : t.content;
    return `Antwort${t.answerMode ? ` (Modus: ${t.answerMode})` : ''}: ${text}`;
  });
  const current = `Letzte Nachricht: "${question}"`;
  return lines.length > 0 ? `Bisheriger Verlauf:\n${lines.join('\n')}\n\n${current}` : current;
}

/**
 * Das erste Antwortwort gewinnt: Modelle setzen gern Anführungszeichen, einen
 * Punkt oder einen Satz drumherum, und schreiben „Präzision" mit Umlaut.
 */
export function parseGuardVerdict(raw: string | null): NotebookResolvedAnswerMode | null {
  if (!raw) return null;
  const match = /pr(?:ä|ae|a)z|chat/i.exec(raw);
  if (!match) return null;
  return match[0].toLowerCase() === 'chat' ? 'chat' : 'praezision';
}

/** Der LLM-Wächter. null bei Fehler, Zeitüberschreitung oder unlesbarer Antwort. */
export async function classifyNotebookAnswerMode(
  question: string,
  history: readonly NotebookGuardTurn[]
): Promise<NotebookResolvedAnswerMode | null> {
  const startTime = Date.now();
  try {
    const response = await withTimeout(
      aiText({
        lane: 'chat_intent_classification',
        pinned: 'standard',
        system: GUARD_PROMPT,
        prompt: formatGuardPrompt(question, history),
        maxOutputTokens: 16,
        temperature: 0,
      }),
      GUARD_TIMEOUT_MS,
      'NotebookAnswerModeGuard'
    );
    const verdict = parseGuardVerdict(response);
    if (verdict == null) {
      log.warn(
        `[NotebookAnswerMode] guard answer unreadable after ${Date.now() - startTime}ms: "${response.slice(0, 40)}"`
      );
    }
    return verdict;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(`[NotebookAnswerMode] guard failed after ${Date.now() - startTime}ms: ${reason}`);
    return null;
  }
}

export async function resolveNotebookAnswerMode(
  input: NotebookAnswerModeInput
): Promise<NotebookAnswerModeResolution> {
  const { requested } = input;
  const decide = (
    resolved: NotebookAnswerModeEvent['resolved'],
    reason: NotebookAnswerModeEvent['reason'],
    branch: BranchOf<'notebook.answer_mode'>,
    warning: NotebookAnswerModeResolution['warning'] = null
  ): NotebookAnswerModeResolution => {
    recordDecision('notebook.answer_mode', branch, {
      inputs: { requested, resolved, reason },
    });
    return { decision: { requested, resolved, reason }, warning };
  };

  if (requested == null) return decide('chat', 'default', 'default');
  if (requested === 'chat') return decide('chat', 'explicit', 'explicit_chat');

  if (!isPraezisionEligible(input.collectionIds, input.userLocale)) {
    return decide(
      'chat',
      'ineligible',
      'ineligible',
      requested === 'praezision' ? 'notebook_praezision_unavailable' : null
    );
  }
  if (requested === 'praezision') return decide('praezision', 'explicit', 'explicit_praezision');

  const question = input.question.trim();
  if (looksLikeNotebookToolAsk(question) && !looksLikeNotebookWriteAsk(question)) {
    return decide('praezision', 'pregate', 'pregate');
  }
  if (!question) return decide('chat', 'guard_fallback', 'guard_fallback');

  const verdict = await classifyNotebookAnswerMode(question, input.history);
  if (verdict == null) return decide('chat', 'guard_fallback', 'guard_fallback');
  return decide(verdict, 'guard', verdict === 'chat' ? 'guard_chat' : 'guard_praezision');
}
