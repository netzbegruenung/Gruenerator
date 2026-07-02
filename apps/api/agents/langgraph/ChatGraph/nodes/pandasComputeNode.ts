/**
 * Pandas Compute Node
 *
 * Codegen step for the run-then-answer spreadsheet flow: generates a short
 * pandas snippet (operating on the pre-loaded `df`) that answers the user's
 * aggregation question. The controller emits it as a `run_python` client_tool
 * interrupt; the browser executes it via Pyodide and posts the result back to
 * the resume endpoint, which feeds it into respondNode as `computedResult`.
 *
 * Only the code is generated here — no prose. The answer text is produced by
 * respondNode after the client returns the computed numbers.
 */

import { isTabularAttachment } from '../../../../routes/chat/services/attachmentProcessingService.js';
import { createLogger } from '../../../../utils/logger.js';

import { extractMessageText } from './classifierHeuristics.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:PandasCompute');

// Codegen quality is the whole point of this node (wrong column names or a
// wrong aggregation = a wrong number presented as ground truth), so pin
// Mistral Medium — the same model the notebooks use — instead of the smaller
// INTERMEDIATE_MODEL. Output is ~100 tokens, latency impact is negligible.
const CODEGEN_MODEL = {
  provider: 'mistral' as const,
  model: 'mistral-medium-2604',
};

const CODEGEN_PROMPT = `Du bist ein Python/pandas-Codegenerator. Im Browser läuft ein Python-Interpreter, in dem die Tabelle der*des Nutzer*in bereits als pandas-DataFrame \`df\` vorgeladen ist (pandas ist als \`pd\` importiert).

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt dieser Form:
{"related": true, "code": "<python-code>"}

Regeln für den Code:
- Verwende die ECHTEN Spaltennamen aus dem Tabellen-Kontext (exakte Schreibweise).
- Gib jedes Ergebnis mit \`print("Label:", wert)\` aus — ein klares deutsches Label pro Zeile (z.B. \`print("Gesamtgewinn:", round(gewinn, 2))\`).
- Halte den Code kurz und robust; keine Datei-/Netzwerkzugriffe, keine Plots.
- Rechne mit fehlenden Werten: nutze dropna() vor idxmax()/idxmin() und prüfe, dass Gruppierungs-Ergebnisse nicht NaN als Schlüssel liefern.
- Enthält die Tabelle bereits eine Spalte für die gefragte Größe (z.B. "Umsatz"), verwende NUR diese Spalte — leite sie NICHT zusätzlich aus anderen Spalten her (z.B. Menge*Einzelpreis) und addiere niemals beides.
- Nur gerade ASCII-Anführungszeichen (") im Code, keine typografischen.
- Wenn die Frage NICHTS mit den Tabellendaten zu tun hat (z.B. Allgemeinwissen, Textaufgaben ohne Bezug zu \`df\`), antworte mit {"related": false, "code": ""}`;

const MAX_TABLE_CONTEXT_CHARS = 6000;
const MAX_CODE_CHARS = 2000;

/** Strip accidental markdown fences — the prompt forbids them, but models slip. */
function stripCodeFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:python|json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/**
 * Parse the codegen response. Primary path is JSON mode ({related, code});
 * fallback treats the whole content as raw code because not every provider
 * adapter honors response_format (the native mistralAdapter drops it — only
 * the litellm/regolo OpenAI-compatible path enforces JSON).
 */
export function parseCodegenResponse(raw: string): { related: boolean; code: string } {
  const stripped = stripCodeFences(raw);
  try {
    const parsed = JSON.parse(stripped) as { related?: unknown; code?: unknown };
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.code === 'string') {
      return { related: parsed.related !== false, code: parsed.code.trim() };
    }
  } catch {
    /* not JSON — fall through to raw-code handling */
  }
  if (/^UNRELATED\b/.test(stripped)) return { related: false, code: '' };
  return { related: true, code: stripped };
}

/**
 * Collect column names + sample rows for the codegen prompt: extracted text of
 * tabular thread attachments first (survives across turns), then the current
 * turn's attachment context as fallback.
 */
function buildTableContext(state: ChatGraphState): string {
  const tabularTexts = (state.threadAttachments ?? [])
    .filter((a) => !a.isImage && a.extractedText && isTabularAttachment(a.name, a.mimeType))
    .map((a) => `### ${a.name}\n${a.extractedText}`);

  const combined = tabularTexts.length
    ? tabularTexts.join('\n\n')
    : (state.attachmentContext ?? '');
  return combined.slice(0, MAX_TABLE_CONTEXT_CHARS);
}

/** The user's RAW last message. Preferred over searchQuery: when the router's
 *  regex gate fires on a search-classified follow-up, searchQuery holds the
 *  retrieval-optimized rewrite — codegen must answer the actual question. */
function lastUserText(state: ChatGraphState): string {
  const msg = [...state.messages].reverse().find((m) => m.role === 'user');
  return msg ? extractMessageText(msg.content) : '';
}

export async function pandasComputeNode(
  state: ChatGraphState,
  opts?: { previousCode?: string; previousError?: string }
): Promise<{ pythonCode: string | null }> {
  const startTime = Date.now();
  const question = lastUserText(state) || state.searchQuery || '';
  const tableContext = buildTableContext(state);

  if (!question || !tableContext) {
    log.warn('[PandasCompute] Missing question or table context — skipping codegen');
    return { pythonCode: null };
  }

  try {
    // Error-correction round: the client executed the previous code and it
    // failed — regenerate with the failure in context (OpenWebUI-style loop).
    const correctionBlock = opts?.previousError
      ? `

Der vorherige Code-Versuch ist FEHLGESCHLAGEN.
Vorheriger Code:
${opts.previousCode ?? '(unbekannt)'}
Fehlermeldung: ${opts.previousError}

Analysiere den Fehler (z.B. falscher Spaltenname, falscher Typ) und schreibe korrigierten, lauffähigen Code.`
      : '';

    const userMessage = `Tabellen-Kontext (Spaltennamen + Beispielzeilen):
${tableContext}

Frage der*des Nutzer*in: ${question}${correctionBlock}

Schreibe den Python-Code.`;

    const response = await state.aiWorkerPool.processRequest(
      {
        type: 'chat_pandas_codegen',
        provider: CODEGEN_MODEL.provider,
        systemPrompt: CODEGEN_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        options: {
          model: CODEGEN_MODEL.model,
          max_tokens: 500,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    const parsed = parseCodegenResponse(response.content || '');
    const code = parsed.code.slice(0, MAX_CODE_CHARS);
    // Escape valve: the model judged the question unrelated to the table —
    // fall through to the normal pipeline instead of running pointless code.
    if (!parsed.related) {
      log.info('[PandasCompute] Question judged unrelated to the table — skipping');
      return { pythonCode: null };
    }
    if (!code) {
      log.error('[PandasCompute] Empty codegen response');
      return { pythonCode: null };
    }

    log.info(`[PandasCompute] Generated ${code.length} chars in ${Date.now() - startTime}ms`);
    return { pythonCode: code };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[PandasCompute] Error: ${errMsg}`);
    return { pythonCode: null };
  }
}
