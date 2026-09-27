/**
 * Headless-Einstieg in den vollen agentischen Loop (#3221, Face 1).
 *
 * Hintergrundläufe (wiederkehrende Aufgaben, Board-Agent) liefen bisher über
 * einen 5-Schritt-Kern ohne Budget, Stall-Guard, Quellen-Registry und Guards.
 * Dieser Einstieg fährt denselben Loop wie ein
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
  type PreparedAgentState,
} from '../../../../services/boards/agentFlow/generate.js';
import { withLangfuseTrace } from '../../../../services/telemetry/langfuseTelemetry.js';
import { createLogger } from '../../../../utils/logger.js';
import { createNullSSE } from '../sseHelpers.js';

import { streamAgenticResponse } from './agenticRespondService.js';
import { DEFAULT_LOOP_BUDGET } from './types.js';

import type { AgenticResponseOutcome } from './agenticRespondService.js';
import type { PersistedStep } from './types.js';
import type { Citation, SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('HeadlessAgenticTurn');

/**
 * Ohne Thread ist `ask_human` gar nicht montiert, aber das Modell weiss das
 * nicht und formuliert die Rückfrage trotzdem — der Lauf endet dann als
 * `failed`, obwohl niemand gefragt war. Billiger als jede Reparatur ist, die
 * Frage vorher zu verhindern.
 */
/**
 * Werkzeuge, die im Hintergrund NICHT montiert werden.
 *
 * Nur `memory`, und zwar ganz: seine drei Aktionen (save/update/forget)
 * schreiben ausnahmslos dauerhafte Notizen über die Person. Es gibt dort
 * nichts zu lesen, das ein Lauf bräuchte.
 *
 * Die `confirm=true`-Zweischritte der übrigen Werkzeuge werden bewusst NICHT
 * hierüber entschärft. Das Gate in `toolCatalog` greift pro WERKZEUG, nicht pro
 * Aktion — `documents`, `notebooks` oder `boards_tasks` wären samt ihrer
 * Leseaktionen verschwunden, und eine Aufgabe wie „fasse montags die offenen
 * Karten aus Board X zusammen" hätte still eine unvollständige Antwort
 * geliefert statt zu scheitern (`NO_QUESTIONS_MODE` sagt dem Modell ja, es
 * solle annehmen und weitermachen). Stattdessen verweigern die Löschzweige
 * selbst, wenn kein Thread da ist — dieselbe Naht, die die kartenbasierten
 * Schreibzugriffe schon benutzen.
 */
export const HEADLESS_WITHHELD_TOOLS: ReadonlySet<string> = new Set(['memory']);

const NO_QUESTIONS_MODE =
  '\n\nDu kannst in diesem Lauf keine Rückfragen stellen — es ist niemand da, der antworten könnte. Triff die naheliegendste Annahme, arbeite weiter und nenne die Annahmen am Anfang des Ergebnisses.';

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
  /** Hintergrundmaterial (z. B. Karteninhalt, Kommentare, verknüpfte Dokumente)
   *  — hängt an der Aufgabe in der User-Message, nicht im Systemprompt. */
  contextBlock?: string;
  /** Schon klassifizierter Zustand für genau diese `instruction` — spart die
   *  zweite Klassifikation, wenn der Aufrufer den Intent vorab brauchte. */
  prepared?: PreparedAgentState;
}

export interface HeadlessTurnResult {
  text: string;
  /** 'none' ⇒ echte Antwort. Alles andere ist Ersatztext des Nie-Werfen-
   *  Vertrags und darf NICHT als Ergebnis abgelegt werden. */
  degraded: 'none' | 'no_answer' | 'aborted' | 'failed';
  /**
   * Klartext-Grund, wo es einen gibt — wandert in `recurring_task_runs.error`
   * und damit in den Verlauf. Ohne ihn stand dort „agentic turn degraded:
   * failed", und die Rückfrage, an der der Lauf scheiterte, kannte nur das Log.
   */
  degradedReason: string | null;
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
  const prepared =
    p.prepared ??
    (await deps.prepareAgentState(p.instruction, p.userLocale, {
      agentId: p.agentId ?? null,
      userId: p.userId,
    }));

  // Schreibende Werkzeuge abschalten, BEVOR der Katalog gebaut wird. Das Gate
  // sitzt in `toolCatalog` auf `state.enabledTools[key] !== false`, also genügt
  // die Zustandsänderung — kein zweiter Katalog-Pfad. Als Kopie, weil ein
  // übergebener Zustand auch die Reparatur-Runde trägt.
  const withheld: Record<string, boolean> = {};
  for (const key of HEADLESS_WITHHELD_TOOLS) withheld[key] = false;
  const finalState = {
    ...prepared.finalState,
    enabledTools: { ...prepared.finalState.enabledTools, ...withheld },
  };

  // `retrievalExpected` wie im Request-Pfad: der Prompt entsteht, bevor ein
  // Tool lief — eine Zitatzahl von 0 sagt hier nichts über die Antwort.
  const baseSystem = await deps.buildSystemMessage(finalState, { retrievalExpected: true });
  const systemMessage = `${baseSystem}${p.longForm ? DOCUMENT_MODE : COMMENT_MODE}${NO_QUESTIONS_MODE}`;

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: p.contextBlock
        ? `${p.instruction}\n\n---\n## Kontext der Karte (Hintergrundmaterial für genau diese Aufgabe)\n${p.contextBlock}`
        : p.instruction,
    },
  ];
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

  // Picker-Auswahl nur bei gebundenem Agenten — Universal-Läufe bleiben breit.
  const agentToolKeys = finalState.agentConfig.enabledTools;
  const searchToolKeys =
    p.restrictToAgentTools && agentToolKeys?.length ? agentToolKeys : undefined;

  // Eigene Wurzel-Spanne: der Request-Pfad öffnet sie in `responseAgentic`, das
  // hier übersprungen wird — ohne sie hängen die Generierungs-Spannen eines
  // Hintergrundlaufs ohne Elternteil und ohne Ein-/Ausgabe in Langfuse.
  let outcome: AgenticResponseOutcome;
  try {
    outcome = await withLangfuseTrace(
      {
        name: 'headless-turn',
        userId: p.userId,
        metadata: {
          requestId: p.slotLabel,
          ...(p.agentId ? { agentId: p.agentId } : {}),
          attempt: p.feedback ? 'repair' : 'initial',
        },
        tags: ['headless'],
      },
      async (trace) => {
        const res = await deps.streamAgenticResponse({
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
        trace.update({ input: p.instruction, output: res.fullText });
        return res;
      }
    );
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
      degradedReason: `Der Agent wollte eine Werkzeug-Freigabe (${outcome.pendingApproval
        .map((c) => c.toolName)
        .join(', ')}) — im Hintergrund kann niemand zustimmen.`,
      steps: outcome.steps,
      citations: outcome.citations,
      sources: outcome.sources,
      modelName: outcome.modelName,
    };
  }

  // Wie die Freigabe: ohne Thread ist `ask_human` nicht montiert, doch ein
  // gehaltener Aufruf (z. B. ein halluzinierter Name) würde sonst als fertiges
  // Ergebnis abgelegt, auf das niemand antwortet.
  if (outcome.pendingAsk) {
    log.error(
      `[Headless] ${p.slotLabel}: Zug wollte eine Rückfrage (${outcome.pendingAsk.question}) — kein Mensch am Lauf, als failed gewertet`
    );
    return {
      text: '',
      degraded: 'failed',
      degradedReason: `Der Agent brauchte eine Rückfrage: „${outcome.pendingAsk.question}" — formuliere die Anweisung eindeutiger.`,
      steps: outcome.steps,
      citations: outcome.citations,
      sources: outcome.sources,
      modelName: outcome.modelName,
    };
  }

  return {
    text: outcome.fullText.trim(),
    degraded: outcome.degraded ?? 'none',
    degradedReason: null,
    steps: outcome.steps,
    citations: outcome.citations,
    sources: outcome.sources,
    modelName: outcome.modelName,
  };
}
