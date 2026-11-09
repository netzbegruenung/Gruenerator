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
import { aiDecide, type ChoiceQuestion } from '../../../services/ai/decide.js';
import { resolveSystemCollection } from '../../../services/notebook/systemNotebookSources.js';
import { recordDecision, type BranchOf } from '../../../utils/decisionJournal.js';
import { createLogger } from '../../../utils/logger.js';
import { collectionsForLocale } from '../agents/searchTools.js';

import { looksLikeNotebookToolAsk, looksLikeNotebookWriteAsk } from './notebookToolAsk.js';

import type {
  ChatWarningCode,
  NotebookAnswerMode,
  NotebookAnswerModeEvent,
  NotebookResolvedAnswerMode,
} from '@gruenerator/contracts';

const log = createLogger('NotebookAnswerMode');

/**
 * Das LLM antwortete in ~270 ms (Median); das Entscheidungsmodell braucht
 * ~150 ms, p90 ~190 ms. 1500 ms lassen dem Ausweich-Host (Metis nach 400 ms)
 * Luft.
 */
const GUARD_TIMEOUT_MS = 1500;
/** Die letzten zwei Wechsel (Frage + Antwort) reichen für eine Folgefrage. */
const GUARD_HISTORY_MESSAGES = 4;
const GUARD_ANSWER_CHARS = 300;

/**
 * Gemessen in `evals/metis` (`notebookMode`, 40 Fälle × 2): Clef Flash und
 * Metis 39/40, das LLM davor 36/40; Holdout beide 9/10. Die Unterscheidung
 * steht in den Optionen, nicht in der Anweisung — lange Anweisungen machten
 * die Modelle schlechter.
 */
const GUARD_QUESTION: ChoiceQuestion = {
  type: 'choice',
  instructions:
    'Wie wird die letzte Nachricht an die Notebook-Quellen beantwortet? Eine Folgefrage („weiter", „genauer", „und die zweite?") übernimmt den Modus, der im Verlauf bei der vorigen Antwort steht. Im Zweifel: chat.',
  criteria: {
    chat: 'eine Inhaltsfrage: was steht drin, zusammenfassen, erklären, vergleichen, Positionen, welche Dokumente sich zu einem THEMA äußern – auch eine Zahl oder ein Datum, das in einer Quelle steht',
    praezision:
      'Arbeit mit den Quellen als Dokumenten: sie auflisten, zählen oder sortieren, eine bestimmte Seite oder einen Abschnitt lesen, ein WÖRTLICHES Wort oder eine wörtliche Formulierung zählen oder finden, ein Zitat wörtlich prüfen',
  },
};

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

/** Der Wächter. null bei Fehler oder Zeitüberschreitung — der Aufrufer fährt dann chat. */
export async function classifyNotebookAnswerMode(
  question: string,
  history: readonly NotebookGuardTurn[]
): Promise<NotebookResolvedAnswerMode | null> {
  const startTime = Date.now();
  try {
    const { mode } = await aiDecide({
      label: 'NotebookAnswerMode',
      state: formatGuardPrompt(question, history),
      questions: { mode: GUARD_QUESTION },
      timeoutMs: GUARD_TIMEOUT_MS,
    });
    if (mode.choice === 'chat' || mode.choice === 'praezision') return mode.choice;
    log.warn(`[NotebookAnswerMode] guard chose unknown option "${mode.choice}"`);
    return null;
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
