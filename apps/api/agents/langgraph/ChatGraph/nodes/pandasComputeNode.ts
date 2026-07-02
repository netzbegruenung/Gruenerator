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
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:PandasCompute');

const CODEGEN_PROMPT = `Du bist ein Python/pandas-Codegenerator. Im Browser läuft ein Python-Interpreter, in dem die Tabelle der*des Nutzer*in bereits als pandas-DataFrame \`df\` vorgeladen ist (pandas ist als \`pd\` importiert).

Schreibe NUR ausführbaren Python-Code, der die Frage der*des Nutzer*in über \`df\` beantwortet:
- Verwende die ECHTEN Spaltennamen aus dem Tabellen-Kontext (exakte Schreibweise).
- Gib jedes Ergebnis mit \`print("Label:", wert)\` aus — ein klares deutsches Label pro Zeile (z.B. \`print("Gesamtgewinn:", round(gewinn, 2))\`).
- Halte den Code kurz und robust; keine Datei-/Netzwerkzugriffe, keine Plots.
- KEIN Markdown, KEINE Code-Fences, KEINE Erklärungen — nur der reine Code.`;

const MAX_TABLE_CONTEXT_CHARS = 6000;
const MAX_CODE_CHARS = 2000;

/** Strip accidental markdown fences — the prompt forbids them, but models slip. */
function stripCodeFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:python)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
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

export async function pandasComputeNode(
  state: ChatGraphState
): Promise<{ pythonCode: string | null }> {
  const startTime = Date.now();
  const question = state.searchQuery || '';
  const tableContext = buildTableContext(state);

  if (!question || !tableContext) {
    log.warn('[PandasCompute] Missing question or table context — skipping codegen');
    return { pythonCode: null };
  }

  try {
    const userMessage = `Tabellen-Kontext (Spaltennamen + Beispielzeilen):
${tableContext}

Frage der*des Nutzer*in: ${question}

Schreibe den Python-Code.`;

    const response = await state.aiWorkerPool.processRequest(
      {
        type: 'chat_pandas_codegen',
        provider: INTERMEDIATE_MODEL.provider,
        systemPrompt: CODEGEN_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        options: {
          model: INTERMEDIATE_MODEL.model,
          max_tokens: 500,
          temperature: 0.1,
        },
      },
      null
    );

    const code = stripCodeFences(response.content || '').slice(0, MAX_CODE_CHARS);
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
