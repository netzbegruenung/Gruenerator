/**
 * `tabelle_auswerten`: das Modell lässt eine angehängte Tabelle rechnen.
 *
 * Wie `check_sharepic` wird das Werkzeug nie wirklich ausgeführt: das
 * Freigabe-Gate fragt die Person (Code läuft in ihrem Browser), danach hält
 * `wrapTools` den Aufruf im `clientToolGate`. Beim Halten erzeugt
 * `pandasComputeNode` den Code aus dem `auftrag`, der Zug pausiert mit einem
 * `run_python`-Interrupt, Pyodide rechnet, und die Fortsetzung
 * (`clientToolResume`) macht aus dem Ergebnis das tool-result dieses Aufrufs —
 * Fehler eingeschlossen, damit das Modell mit präzisiertem Auftrag nachlegt.
 * `execute` ist nur der defensive Rest für Aufrufer am Wrapper vorbei.
 */
import { computePayloadSchema } from '@gruenerator/contracts';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { pandasComputeNode } from '../../../agents/langgraph/ChatGraph/nodes/pandasComputeNode.js';
import { createLogger } from '../../../utils/logger.js';
import { getThreadAttachments } from '../services/attachmentPersistenceService.js';
import { isTabularAttachment } from '../services/attachmentProcessingService.js';
import { persistComputeAssets } from '../services/computeAssetStorage.js';
import { hasBrokenComputeValues } from '../services/computeResultSanity.js';
import { verifyComputeResult } from '../services/computeResultVerifier.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { LoopClientTool } from '../services/agenticLoop/clientToolRegistry.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';

const log = createLogger('TabelleAuswerten');

export const TABELLE_AUSWERTEN_TOOL = 'tabelle_auswerten';
const RUN_PYTHON_CLIENT_TOOL = 'run_python';
/** Die Gegenwahl auf dem erzwungenen ersten Schritt (siehe `UNRECORDED_TOOLS`). */
export const DIREKT_ANTWORTEN_TOOL = 'direkt_antworten';

const MAX_ERROR_CHARS = 1500;
/** Original plus zwei Wiederholungen. Serverseitig gezählt: jede Fortsetzung
 *  baut frische Loop-Guards, die den Verlauf vor der Pause nicht kennen. */
const MAX_FAILED_RUNS = 3;
const MAX_OUTPUT_CHARS = 4000;
/**
 * Reist mit jedem Erfolg im tool-result — dort liest auch der Split-Writer,
 * der die Werkzeugbeschreibung nie sieht. Live (#5043) nannte die Antwort
 * Namen, die in keiner Ausgabe standen, und schrieb „2114.23 EUR".
 */
export const TABELLE_ANTWORTREGEL =
  'Schreibe nur, was in `ergebnis` steht: keine Namen, Listen, Zuordnungen oder Zahlen, die dort fehlen — fehlt etwas, rufe tabelle_auswerten mit präzisiertem auftrag erneut auf. Zahlen und Daten in deutscher Schreibweise (2.114,23 €, 31.01.2004).';

export const tabelleAuswertenInputSchema = z.object({
  auftrag: z
    .string()
    .min(3)
    .max(500)
    .describe('Was berechnet, gefiltert oder ausgefüllt werden soll — in eigenen Worten'),
  modus: z
    .enum(['auswerten', 'ausfuellen'])
    .default('auswerten')
    .describe('„auswerten" für Zahlen und Listen, „ausfuellen" um die Datei selbst zu befüllen'),
});

/**
 * Can the client finish a `tabelle_auswerten` turn? Old web bundles and shipped
 * desktop builds declare `run_python` but never run a client tool after an
 * approval resume — the turn would stall after „Einmal erlauben". New clients
 * announce the capability additively as `tabelle_auswerten` in `clientTools`.
 */
export function clientCanUseTabularToolFrom(
  clientTools: readonly string[] | null | undefined
): boolean {
  return (
    clientTools != null &&
    clientTools.includes(TABELLE_AUSWERTEN_TOOL) &&
    clientTools.includes(RUN_PYTHON_CLIENT_TOOL)
  );
}

/**
 * Single source of truth for "is the tool available this turn": the catalog
 * mounts it, the routing stage sends the turn into the loop, and the prompt
 * mentions it under exactly this condition (plus the loop). Needs a signed-in
 * user (approval gate) and a client that runs Python AND resumes client tools.
 */
export function isTabelleAuswertenMountable(
  state: Pick<
    ChatGraphState,
    'hasTabularAttachment' | 'clientCanRunPython' | 'clientCanUseTabularTool' | 'enabledTools'
  > & {
    agentConfig?: { userId?: string | null | undefined } | null;
  }
): boolean {
  return Boolean(
    state.hasTabularAttachment &&
    state.clientCanRunPython &&
    state.clientCanUseTabularTool &&
    state.agentConfig?.userId != null &&
    state.enabledTools?.[TABELLE_AUSWERTEN_TOOL] !== false
  );
}

export function makeTabelleAuswertenTool(): Tool {
  return tool({
    description: `Wertet die angehängte Tabelle (Excel/CSV) aus: erzeugt Python-Code und lässt ihn im Browser der Person rechnen. Liefert die Ausgabe (\`ergebnis\`), erzeugte Dateien und den Code.

NUTZE WENN eine Antwort aus den Tabellendaten berechnet werden muss — jede Summe, jeder Durchschnitt, jede Zählung, Filterung, Sortierung, Datumslogik oder das Ausfüllen der Datei (\`modus: "ausfuellen"\`). Rechne NIE selbst aus dem Tabellentext und schreibe NIE einen Python-Block in die Antwort.

Rufe es direkt auf — die Freigabe fragt das System selbst ab. Bitte nie im Text um Bestätigung und kündige den Aufruf nie nur an.

Bei einem Fehler (\`error\`) oder einem berechtigten \`hinweis\` der Plausibilitätsprüfung rufe es mit einem präzisierten \`auftrag\` erneut auf (z. B. mit dem richtigen Spaltennamen) — höchstens zweimal. Hat die Person die Ausführung abgelehnt, antworte ohne Rechnung aus dem Kontext und sag deutlich, dass die Zahlen nicht berechnet wurden.`,
    inputSchema: tabelleAuswertenInputSchema,
    execute: async () => ({ error: 'tabelle_auswerten wird nie direkt ausgeführt.' }),
  });
}

/**
 * Ein Tabellen-Turn verlangt auf dem ersten Schritt eine Wahl: rechnen oder
 * ausdrücklich nicht. Ohne sie schwieg der Planer bei Anschlussfragen, und der
 * werkzeuglose Schreiber rechnete aus dem Tabellenauszug — falsch (#5042).
 */
export function makeDirektAntwortenTool(): Tool {
  return tool({
    description: `Wähle das, wenn die Antwort KEINE neue Rechnung über die angehängte Tabelle braucht — etwa Dank, Umformulieren einer früheren Antwort, eine Frage zum Gesprächsverlauf oder etwas, das gar nicht in der Tabelle steht. Danach stehen dir alle anderen Werkzeuge wieder zur Verfügung.

Jede Zahl, Summe, Zählung, Liste, Filterung, Sortierung oder Einzelangabe AUS der Tabelle braucht stattdessen \`tabelle_auswerten\`.`,
    inputSchema: z.object({}),
    execute: async () => ({
      ok: true,
      hinweis:
        'Antworte ohne neue Tabellen-Rechnung. Brauchst du doch Werte aus der Tabelle, rufe tabelle_auswerten auf.',
    }),
  });
}

/** Ein gelaufener, gescheiterter Code — eine Ablehnung trägt keinen. */
function failedRunOf(step: PersistedStep): { code: string; error: string } | null {
  if (step.toolName !== TABELLE_AUSWERTEN_TOOL) return null;
  const result = step.result as { error?: unknown; code?: unknown } | null;
  return typeof result?.error === 'string' && typeof result.code === 'string'
    ? { code: result.code, error: result.error }
    : null;
}

/** Der jüngste gescheiterte Lauf dieses Zuges — sein Code und Fehler gehen in die Korrektur. */
function lastFailedRun(priorSteps: PersistedStep[]): { code: string; error: string } | null {
  const last = [...priorSteps].reverse().find((step) => step.toolName === TABELLE_AUSWERTEN_TOOL);
  return last ? failedRunOf(last) : null;
}

/**
 * Die Tabellen-Anhänge, aus denen der Codegen Spalten und Beispielzeilen liest.
 * Im ersten Zug eines Threads liegen sie noch nicht im Zustand, und eine grosse
 * Tabelle ist vektorisiert (`attachmentContext` genullt) — die Freigabe-
 * Fortsetzung stellt genau diesen Zustand wieder her (live 27.10.2026,
 * T06_buchungen_500.xlsx: „Missing question or table context"). Seit die
 * Anhänge beim Pausieren gespeichert werden, stehen sie am Thread.
 */
async function threadAttachmentsForCodegen(
  state: ChatGraphState,
  threadId: string | null
): Promise<ChatGraphState['threadAttachments']> {
  const current = state.threadAttachments ?? [];
  const hasTable = current.some(
    (a) => !a.isImage && a.extractedText && isTabularAttachment(a.name, a.mimeType)
  );
  if (hasTable || !threadId) return current;
  try {
    const stored = await getThreadAttachments(threadId);
    return stored.length > 0 ? stored : current;
  } catch (err) {
    log.warn(
      `[Tabelle] Thread-Anhänge nicht ladbar (Thread ${threadId}): ${err instanceof Error ? err.message : String(err)}`
    );
    return current;
  }
}

function clientErrorOf(result: unknown): string {
  if (result != null && typeof result === 'object' && 'error' in result) {
    const error = (result as { error: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return 'Der Browser lieferte kein gültiges Ergebnis.';
}

export const tabelleAuswertenClientTool: LoopClientTool = {
  loopToolName: TABELLE_AUSWERTEN_TOOL,
  clientToolName: RUN_PYTHON_CLIENT_TOOL,
  async resolve({ state, args, priorSteps, threadId }) {
    const auftrag = typeof args.auftrag === 'string' ? args.auftrag.trim() : '';
    if (!auftrag) return { error: 'Der Auftrag fehlt.' };
    if (priorSteps.filter((step) => failedRunOf(step) != null).length >= MAX_FAILED_RUNS) {
      return { error: 'Nicht mehr erneut versuchen — antworte ohne Rechnung und sag das.' };
    }
    const mode = args.modus === 'ausfuellen' ? ('fill' as const) : ('analyze' as const);
    const failed = lastFailedRun(priorSteps);

    // Der Codegen liest die Frage aus der letzten Nutzernachricht — dort steht
    // hier der Auftrag des Modells, nicht der Turn-Text der Person.
    const codegenState: ChatGraphState = {
      ...state,
      threadAttachments: await threadAttachmentsForCodegen(state, threadId),
      messages: [...(state.messages ?? []), { role: 'user', content: auftrag }],
    };
    const { pythonCode, computeFailed } = await pandasComputeNode(codegenState, {
      mode,
      ...(failed ? { previousCode: failed.code, previousError: failed.error } : {}),
    });
    if (computeFailed) return { error: 'Code konnte nicht erzeugt werden.' };
    if (!pythonCode) return { error: 'Diese Frage lässt sich nicht aus der Tabelle berechnen.' };
    return { clientArgs: { code: pythonCode } };
  },
  async toToolResult({ threadId, stored, result, sse, userId }) {
    const code = typeof stored.clientArgs.code === 'string' ? stored.clientArgs.code : '';
    const parsed = computePayloadSchema.safeParse(result);
    if (!parsed.success) {
      const error = clientErrorOf(result).slice(0, MAX_ERROR_CHARS);
      log.info(`[Tabelle] Lauf gescheitert (Thread ${threadId}): ${error.slice(0, 200)}`);
      return { toolResult: { error, code }, ok: false };
    }
    if (hasBrokenComputeValues(parsed.data)) {
      const error =
        `Der Code lief durch, aber das Ergebnis enthält nan/leere Werte — vermutlich falsche Spaltenwahl oder fehlendes dropna(). Ausgabe: ${parsed.data.summary}`.slice(
          0,
          MAX_ERROR_CHARS
        );
      return { toolResult: { error, code }, ok: false };
    }

    // Asset-URLs mintet NUR der Server (sie werden als <img>/<a> gerendert) —
    // was der Client mitschickt, fällt weg; die base64-Dateien wandern auf die
    // Platte, die Nachricht trägt danach nur kleine, authentifizierte URLs.
    const { figureUrls: _figureUrls, fileAssets: _fileAssets, ...clientSafe } = parsed.data;
    // Plausibel aussehend, aber falsch (falsche Spalte summiert)? Der Hinweis
    // geht ins Ergebnis, das Modell entscheidet über einen präzisierten Neuaufruf.
    // Beim Ausfüllen ist die Datei das Ergebnis — dort gibt es nichts zu prüfen.
    const [payload, hinweis] = await Promise.all([
      persistComputeAssets(userId, clientSafe),
      stored.args.modus === 'ausfuellen'
        ? null
        : verifyComputeResult({
            question: stored.classifiedState.lastUserTextNoMentions ?? null,
            auftrag: typeof stored.args.auftrag === 'string' ? stored.args.auftrag : '',
            code,
            entries: parsed.data.entries,
          }),
    ]);
    sse.send('compute', { compute: payload });

    const dateien = (payload.fileAssets ?? payload.files ?? []).map((f) => f.name);
    return {
      toolResult: {
        ergebnis: payload.summary.slice(0, MAX_OUTPUT_CHARS),
        dateien,
        code,
        antwortregel: TABELLE_ANTWORTREGEL,
        ...(hinweis
          ? {
              hinweis: `Plausibilitätsprüfung: ${hinweis} Ist das Ergebnis falsch, rufe tabelle_auswerten mit einem präzisierten auftrag erneut auf.`,
            }
          : {}),
      },
      classifiedStatePatch: { computedResult: payload, computedResultFresh: true },
    };
  },
};
