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
import { persistComputeAssets } from '../services/computeAssetStorage.js';
import { hasBrokenComputeValues } from '../services/computeResultSanity.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { LoopClientTool } from '../services/agenticLoop/clientToolRegistry.js';
import type { PersistedStep } from '../services/agenticLoop/types.js';

const log = createLogger('TabelleAuswerten');

export const TABELLE_AUSWERTEN_TOOL = 'tabelle_auswerten';
const RUN_PYTHON_CLIENT_TOOL = 'run_python';

const MAX_ERROR_CHARS = 1500;
/** Original plus zwei Wiederholungen. Serverseitig gezählt: jede Fortsetzung
 *  baut frische Loop-Guards, die den Verlauf vor der Pause nicht kennen. */
const MAX_FAILED_RUNS = 3;
const MAX_OUTPUT_CHARS = 4000;

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

export function makeTabelleAuswertenTool(): Tool {
  return tool({
    description: `Wertet die angehängte Tabelle (Excel/CSV) aus: erzeugt Python-Code und lässt ihn im Browser der Person rechnen. Liefert die Ausgabe (\`ergebnis\`), erzeugte Dateien und den Code.

NUTZE WENN eine Antwort aus den Tabellendaten berechnet werden muss — jede Summe, jeder Durchschnitt, jede Zählung, Filterung, Sortierung, Datumslogik oder das Ausfüllen der Datei (\`modus: "ausfuellen"\`). Rechne NIE selbst aus dem Tabellentext und schreibe NIE einen Python-Block in die Antwort.

Bei einem Fehler (\`error\`) rufe es mit einem präzisierten \`auftrag\` erneut auf (z. B. mit dem richtigen Spaltennamen) — höchstens zweimal. Hat die Person die Ausführung abgelehnt, antworte ohne Rechnung aus dem Kontext und sag deutlich, dass die Zahlen nicht berechnet wurden.`,
    inputSchema: tabelleAuswertenInputSchema,
    execute: async () => ({ error: 'tabelle_auswerten wird nie direkt ausgeführt.' }),
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
  async resolve({ state, args, priorSteps }) {
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
    const payload = await persistComputeAssets(userId, clientSafe);
    sse.send('compute', { compute: payload });

    const dateien = (payload.fileAssets ?? payload.files ?? []).map((f) => f.name);
    return {
      toolResult: { ergebnis: payload.summary.slice(0, MAX_OUTPUT_CHARS), dateien, code },
      classifiedStatePatch: { computedResult: payload, computedResultFresh: true },
    };
  },
};
