/**
 * Headless-Einstieg in den vollen agentischen Loop (#3221, Face 1).
 *
 * Hintergrundläufe (heute: wiederkehrende Aufgaben) liefen bisher über den
 * 5-Schritt-Kern `agentFlow/generate.ts` — ohne Budget, Stall-Guard,
 * Quellen-Registry und Guards. Dieser Einstieg fährt denselben Loop wie ein
 * Chat-Turn, nur ohne Leitung: `createNullSSE()` statt Response-gebundenem
 * Writer, kein `req` (Compound-Fat-Tools bleiben unmontiert), kein Thread,
 * keine MCP-Kataloge (`disableMcp` — ein Hintergrundlauf hat niemanden, der
 * eine Freigabe erteilen könnte; ohne Connectoren kann das Gate strukturell
 * nicht feuern).
 *
 * Der wichtigste Unterschied zum Request-Pfad ist der Umgang mit dem
 * Nie-Werfen-Vertrag des Loops: dort IST der Entschuldigungstext die ehrliche
 * Auskunft an die Person, hier wäre er ein falsches Ergebnisdokument. Deshalb
 * wird `outcome.degraded` durchgereicht und der Aufrufer entscheidet
 * (Empty-Pfad, Failed-Pfad, Liefern).
 */
import { buildSystemMessage } from '../../../../agents/langgraph/ChatGraph/index.js';
import {
  DOCUMENT_MODE,
  COMMENT_MODE,
  prepareAgentState,
} from '../../../../services/boards/agentFlow/generate.js';
import { createLogger } from '../../../../utils/logger.js';
import { createNullSSE } from '../sseHelpers.js';

import { streamAgenticResponse } from './agenticRespondService.js';
import { DEFAULT_LOOP_BUDGET } from './types.js';

import type { AgenticResponseOutcome } from './agenticRespondService.js';
import type { PersistedStep } from './types.js';
import type { Citation, SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('HeadlessAgenticTurn');

export interface HeadlessTurnParams {
  instruction: string;
  userId: string;
  /** Gebundener Agent (user/shared/system); null/leer ⇒ Universal-Agent. */
  agentId?: string | null;
  userLocale: 'de-DE' | 'de-AT';
  /** DOKUMENT-MODUS (lange Form) vs. KOMMENTAR-MODUS — dieselben Suffixe wie
   *  der alte Kern, damit die Ergebnisform gleich bleibt. */
  longForm: boolean;
  /** requestId für Logs/Slots, z. B. `recurring-task-<id>`. */
  slotLabel: string;
  /** Suchfamilie auf die Picker-Auswahl des gebundenen Agenten beschränken —
   *  die `restrictToAgentTools`-Semantik des alten Kerns. */
  restrictToAgentTools?: boolean;
  /** Rückmeldung der Ergebnis-Prüfung für die EINE Reparatur-Runde: der
   *  vorherige Entwurf plus Hinweis werden als zweite User-Message angehängt. */
  feedback?: { hint: string; priorDraft: string };
  /** Harte Decke über dem Lauf. Default: die hardCap des Loop-Budgets. */
  deadlineMs?: number;
}

export interface HeadlessTurnResult {
  text: string;
  /** 'none' ⇒ echte Antwort. Alles andere ist Ersatztext des Nie-Werfen-
   *  Vertrags und darf NICHT als Ergebnis abgelegt werden. */
  degraded: 'none' | 'no_answer' | 'aborted' | 'failed';
  steps: PersistedStep[];
  citations: Citation[];
  sources: SearchResult[];
  modelName: string;
}

export interface HeadlessTurnDeps {
  prepareAgentState: typeof prepareAgentState;
  buildSystemMessage: typeof buildSystemMessage;
  streamAgenticResponse: typeof streamAgenticResponse;
}

const defaultDeps: HeadlessTurnDeps = {
  prepareAgentState,
  buildSystemMessage,
  streamAgenticResponse,
};

export async function runHeadlessAgenticTurn(
  p: HeadlessTurnParams,
  deps: HeadlessTurnDeps = defaultDeps
): Promise<HeadlessTurnResult> {
  const { finalState } = await deps.prepareAgentState(p.instruction, p.userLocale, {
    agentId: p.agentId ?? null,
    userId: p.userId,
  });

  // `retrievalExpected` wie im Request-Pfad: der Prompt entsteht, bevor ein
  // Tool lief — eine Zitatzahl von 0 sagt hier nichts über die Antwort.
  const baseSystem = await deps.buildSystemMessage(finalState, { retrievalExpected: true });
  const systemMessage = `${baseSystem}${p.longForm ? DOCUMENT_MODE : COMMENT_MODE}`;

  const messages: ModelMessage[] = [{ role: 'user', content: p.instruction }];
  if (p.feedback) {
    messages.push({
      role: 'user',
      content:
        `Überarbeite deine Antwort. Rückmeldung der Qualitätsprüfung: ${p.feedback.hint}\n\n` +
        `Dein bisheriger Entwurf:\n${p.feedback.priorDraft}`,
    });
  }

  // Eigene Decke statt `createTurnDeadline`: dessen 360 s budgetieren einen
  // ganzen HTTP-Turn samt Klassifikation — die lief hier schon.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), p.deadlineMs ?? DEFAULT_LOOP_BUDGET.hardCapMs);
  timer.unref?.();

  // Picker-Auswahl nur bei gebundenem Agenten — Universal-Läufe bleiben breit
  // (dieselbe Tür wie `generateFromState.restrictToAgentTools`).
  const agentToolKeys = finalState.agentConfig.enabledTools;
  const searchToolKeys =
    p.restrictToAgentTools && agentToolKeys?.length ? agentToolKeys : undefined;

  let outcome: AgenticResponseOutcome;
  try {
    outcome = await deps.streamAgenticResponse({
      finalState,
      systemMessage,
      messages,
      requestId: p.slotLabel,
      sse: createNullSSE(),
      reqSignal: controller.signal,
      threadId: null,
      toolHistory: null,
      disableMcp: true,
      ...(searchToolKeys ? { searchToolKeys } : {}),
    });
  } finally {
    clearTimeout(timer);
  }

  // Strukturell unerreichbar (ohne MCP feuert das Gate nicht) — aber wenn es
  // je feuert, wartet niemand: laut scheitern statt still hängen.
  if (outcome.pendingApproval && outcome.pendingApproval.length > 0) {
    log.error(
      `[Headless] ${p.slotLabel}: Zug wollte eine Werkzeug-Freigabe (${outcome.pendingApproval
        .map((c) => c.toolName)
        .join(', ')}) — kein Mensch am Lauf, als failed gewertet`
    );
    return {
      text: '',
      degraded: 'failed',
      steps: outcome.steps,
      citations: outcome.citations,
      sources: outcome.sources,
      modelName: outcome.modelName,
    };
  }

  return {
    text: outcome.fullText.trim(),
    degraded: outcome.degraded ?? 'none',
    steps: outcome.steps,
    citations: outcome.citations,
    sources: outcome.sources,
    modelName: outcome.modelName,
  };
}
