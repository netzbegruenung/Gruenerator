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

import { lastUserText } from './classifierHeuristics.js';

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
- Arbeitsmappen mit mehreren Blättern: \`df\` ist das ERSTE Blatt; ALLE Blätter sind als \`sheets["Blattname"]\` verfügbar (Namen stehen im Tabellen-Kontext). Wähle das Blatt, dessen Spalten zur Frage passen.
- Gib jedes Ergebnis mit \`print("Label:", wert)\` aus — ein klares deutsches Label pro Zeile (z.B. \`print("Gesamtgewinn:", round(gewinn, 2))\`).
- Halte den Code kurz und robust; keine Datei-/Netzwerkzugriffe, keine Plots.
- Rechne mit fehlenden Werten: nutze dropna() vor idxmax()/idxmin() und prüfe, dass Gruppierungs-Ergebnisse nicht NaN als Schlüssel liefern.
- Enthält die Tabelle bereits eine Spalte für die gefragte Größe (z.B. "Umsatz"), verwende NUR diese Spalte — leite sie NICHT zusätzlich aus anderen Spalten her (z.B. Menge*Einzelpreis) und addiere niemals beides.
- Enthält die Tabelle Gesamt- oder Zwischensummenzeilen (z.B. "Gesamt"/"Summe"-Label oder leere Schlüsselspalten am Tabellenende), schließe sie bei Aggregationen UND Gruppierungen aus — sonst verdoppeln sich Summen.
- Anteile, Margen und Quoten aggregiert berechnen (Summe Zähler / Summe Nenner), NICHT als Mittelwert von Zeilen-Quoten.
- Wünscht der*die Nutzer*in eine Datei/einen Export, schreibe sie ins Arbeitsverzeichnis (z.B. df.to_csv("export.csv", index=False)) und printe danach "Datei erstellt: export.csv" — die Datei wird automatisch zum Download angeboten.
- Nur gerade ASCII-Anführungszeichen (") im Code, keine typografischen.
- Wenn die Frage NICHTS mit den Tabellendaten zu tun hat (z.B. Allgemeinwissen, Textaufgaben ohne Bezug zu \`df\`), antworte mit {"related": false, "code": ""}`;

// Filling writes the ORIGINAL workbook with openpyxl instead of aggregating the
// pre-loaded `df`. pandas would round-trip the file through a DataFrame and drop
// formatting, formulas, merged cells and column widths — everything that makes a
// form a form. The file is already staged in the Pyodide FS under its exact
// upload name (runCore stages every attached file before running), so the code
// can just open it by name.
const FILL_PROMPT = `Du bist ein Python-Codegenerator. Im Browser läuft ein Python-Interpreter, in dem die hochgeladene Datei der*des Nutzer*in unter ihrem Originalnamen im Arbeitsverzeichnis liegt. Du sollst sie AUSFÜLLEN.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt dieser Form:
{"related": true, "code": "<python-code>"}

Regeln für den Code:
- .xlsx-Dateien: IMMER mit openpyxl bearbeiten, NIEMALS mit pandas. Nur openpyxl erhält Formatierung, Formeln, verbundene Zellen und Spaltenbreiten der Vorlage.
  \`import openpyxl\`, \`wb = openpyxl.load_workbook("<Originalname>")\`, \`ws = wb.active\` (oder \`wb["Blattname"]\`), Zellen per \`ws["B4"] = "Wert"\` bzw. \`ws.cell(row=4, column=2, value="Wert")\` setzen.
- .csv-Dateien: mit pandas bearbeiten und über \`to_csv(..., index=False)\` schreiben.
- .xls-Dateien (altes Format) können NICHT geschrieben werden: mit \`pd.read_excel\` lesen und das Ergebnis als .xlsx speichern (\`to_excel(..., index=False)\`). Weise in der Ausgabe per print darauf hin, dass das Format auf .xlsx gewechselt ist.
- Speichere IMMER unter einem NEUEN Dateinamen: Originalname ohne Endung + "_ausgefuellt" + Endung (z.B. \`wb.save("Vorlage_ausgefuellt.xlsx")\`). Überschreibe die Originaldatei NIEMALS — nur neu geschriebene Dateien werden zum Download angeboten.
- Verwende die ECHTEN Blatt- und Spaltennamen bzw. Zellbezüge aus dem Datei-Kontext. Rate keine Zellen: leite die Zielzelle aus der Beschriftung in der Nachbarzelle ab (Beschriftung in Spalte A → Wert in Spalte B derselben Zeile).
- Trage NUR Werte ein, die die*der Nutzer*in genannt hat oder die sich eindeutig aus der Datei berechnen lassen. Erfinde nichts; lass unklare Felder leer.
- Formelzellen NICHT überschreiben — sie rechnen sich selbst.
- Printe nach dem Speichern eine Zeile pro befülltem Feld im Format \`print("B4 = Wert")\` und zum Schluss \`print("Datei erstellt: <Dateiname>")\`.
- Keine Netzwerkzugriffe. Nur gerade ASCII-Anführungszeichen (") im Code, keine typografischen.
- Wenn die Anfrage nichts mit dem Ausfüllen dieser Datei zu tun hat, antworte mit {"related": false, "code": ""}`;

const MAX_TABLE_CONTEXT_CHARS = 8000;
const TABLE_TAIL_CHARS = 2000;
const MAX_CODE_CHARS = 2000;
// A form fill touches many cells and prints a line per field — the analyze
// budget (one aggregation + one print) is far too tight.
const MAX_FILL_CODE_CHARS = 6000;

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
 * Head+tail truncation for oversized table text: the END of a spreadsheet is
 * load-bearing (GESAMT/Summen rows, latest months, data extent) — a head-only
 * slice hid a real user's total row from the codegen, which then summed it as
 * data. Cut on line boundaries so no half rows confuse the model.
 */
export function truncateTableContext(text: string): string {
  if (text.length <= MAX_TABLE_CONTEXT_CHARS) return text;
  const headBudget = MAX_TABLE_CONTEXT_CHARS - TABLE_TAIL_CHARS;
  const headCut = text.lastIndexOf('\n', headBudget);
  const head = text.slice(0, headCut > 0 ? headCut : headBudget);
  const tailCut = text.indexOf('\n', text.length - TABLE_TAIL_CHARS);
  const tail = text.slice(tailCut > 0 ? tailCut + 1 : text.length - TABLE_TAIL_CHARS);
  return `${head}\n... [Tabelle gekürzt] ...\n${tail}`;
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
  return truncateTableContext(combined);
}

/**
 * Exact upload names of the tabular attachments. Fill mode needs them verbatim
 * for `load_workbook(...)` — `buildTableContext` only carries them as a `###`
 * heading inside a possibly truncated blob, which is not a reliable source for
 * a file path. Falls back to parsing those headings when the thread-attachment
 * rows are not loaded yet (first turn).
 */
function tabularFileNames(state: ChatGraphState): string[] {
  const fromAttachments = (state.threadAttachments ?? [])
    .filter((a) => !a.isImage && isTabularAttachment(a.name, a.mimeType))
    .map((a) => a.name);
  if (fromAttachments.length > 0) return fromAttachments;

  return [...(state.attachmentContext ?? '').matchAll(/^### (.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((name) => isTabularAttachment(name, ''));
}

export { lastUserText } from './classifierHeuristics.js';

export async function pandasComputeNode(
  state: ChatGraphState,
  opts?: { previousCode?: string; previousError?: string; mode?: 'analyze' | 'fill' }
): Promise<{ pythonCode: string | null }> {
  const startTime = Date.now();
  const isFill = opts?.mode === 'fill';
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

    // Fill mode opens the file by path, so the exact upload name must be stated
    // outside the (truncatable) table blob.
    const fileNames = isFill ? tabularFileNames(state) : [];
    const fileBlock = fileNames.length
      ? `Dateiname(n) im Arbeitsverzeichnis (exakt so verwenden): ${fileNames.join(', ')}\n\n`
      : '';

    const userMessage = `${fileBlock}${isFill ? 'Datei-Kontext' : 'Tabellen-Kontext'} (Spaltennamen + Beispielzeilen):
${tableContext}

${isFill ? 'Auftrag' : 'Frage'} der*des Nutzer*in: ${question}${correctionBlock}

Schreibe den Python-Code.`;

    const response = await state.aiWorkerPool.processRequest(
      {
        type: 'chat_pandas_codegen',
        provider: CODEGEN_MODEL.provider,
        systemPrompt: isFill ? FILL_PROMPT : CODEGEN_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        options: {
          model: CODEGEN_MODEL.model,
          max_tokens: isFill ? 1500 : 500,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    const parsed = parseCodegenResponse(response.content || '');
    const code = parsed.code.slice(0, isFill ? MAX_FILL_CODE_CHARS : MAX_CODE_CHARS);
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
