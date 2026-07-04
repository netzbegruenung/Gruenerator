/**
 * Sheet AI service
 *
 * Turns a natural-language spreadsheet-edit request into a list of structured
 * sheet operations (SheetOperation[]). The operations are applied CLIENT-SIDE
 * by the sheets editor via the Univer Facade API (and then flow through the
 * mutation-log collab bridge) — this service only plans them.
 *
 * Mirrors boards/boardAiService.ts (plan-then-apply, plain JSON, no streaming).
 */

import { sheetOperationSchema, type SheetOperation } from '@gruenerator/contracts';
import { generateText, tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../chat/agents/providers.js';

const log = createLogger('SheetAI');

// Sheet planning ALWAYS uses Mistral Medium 3.5 — it is the op-planner and
// needs a strong model; smaller fallbacks (mistral-small on Regolo, verdigado
// on LiteLLM) mis-shape or drop set_range_values ops, which is what produced
// "keine Tabellen-Änderung erkannt". Pinned with no provider chain: if Mistral
// is unavailable we fail loudly rather than silently downgrade the model.
// `mistral-medium-2604` === "Mistral Medium 3.5" (see services/ai/modelDiscovery.ts).
const SHEET_AI_PROVIDER = 'mistral';
const SHEET_AI_MODEL = 'mistral-medium-2604';

const SHEET_TOOL_STRICT_PROMPT = `You translate a user's request into spreadsheet operations by calling the tool applySheetOperations.

You MUST respond ONLY by calling applySheetOperations with { "operations": [ ... ] }.

Permitted operation types (each object needs a "type" field):
- { "type": "set_range_values", "range": "A1:C3", "values": [[...],[...]], "asText"?: false, "sheet"?: "Name" }
    // range in A1 notation; values is a 2D array (array of rows) matching the range shape
    // asText:true forces TEXT for ids, ZIP, phone numbers, leading zeros, or codes like "2-2"
- { "type": "set_formula", "cell": "D2", "formula": "=SUM(A1:A10)", "sheet"?: "Name" }
    // single cell; formula starts with "=" and uses A1 references
- { "type": "set_number_format", "range": "B2:B20", "pattern": "#,##0.00 €", "sheet"?: "Name" }
    // DISPLAY format only, never changes the stored value. Patterns: "#,##0.00 €"=Euro,
    // "0%"=Prozent, "yyyy-MM-dd"=Datum, "#,##0"=Tausender, "@"=Text
- { "type": "format_range", "range": "A1:C1", "bold"?: true, "background"?: "#e8f5e9", "fontColor"?: "#1b5e20", "sheet"?: "Name" }
- { "type": "add_sheet", "name": "Blatt 2" }
- { "type": "clear_range", "range": "B2:B5", "sheet"?: "Name" }

RULES:
- Ranges/cells ALWAYS in A1 notation. Row 1 is the first row, column A the first column.
- The "AKTUELLER TABELLEN-ZUSTAND" below shows the existing values at their A1 coordinates. To CHANGE existing data, emit set_range_values (or set_formula) targeting exactly those coordinates — this OVERWRITES them. Do not overwrite unrelated cells.
- "values" MUST be a 2D array even for a single cell: a single value is [["x"]], one row is [["a","b","c"]], one column is [["a"],["b"],["c"]].
- In set_range_values, a string starting with "=" is treated as a formula.
- Numbers must be JSON numbers (1234.5), not localized strings.
- CURRENCY / PERCENT / DATES are a NUMBER plus a number format, never a formatted string. To show money, percentages, or dates: write the numeric value with set_range_values AND apply set_number_format. Never write "1.000 €", "25%", or "2022-12-05" as a text value into a numeric column — it breaks formulas, sorting and export. (For percent, 25% is the number 0.25 with pattern "0%".)
- The "Spalten-Typen" note in the sheet state marks which columns are Währung/Prozent/Datum/Formel — respect those types when you change them.
- For ids, ZIP codes, phone numbers, leading zeros, or codes like "2-2", use set_range_values with asText:true so they are not auto-converted to numbers/dates.
- "sheet" is the sheet NAME; omit it to target the active sheet.
- Write German content with gender-inclusive language (Genderstern *) where text is generated.
- The user is explicitly asking for a change — emit the operations that carry it out. Only return an empty array if the request is truly impossible or requires no change.
- Return ONLY the tool call. No prose.

EXAMPLE 1 — the sheet has "Umsatz" in A1 and 1000 in B1, and the user says "ändere den Umsatz auf 2500":
{ "operations": [ { "type": "set_range_values", "range": "B1", "values": [[2500]] } ] }
EXAMPLE 2 — user says "formatiere Spalte B als Euro":
{ "operations": [ { "type": "set_number_format", "range": "B2:B100", "pattern": "#,##0.00 €" } ] }`;

/**
 * Coerce the two shape mistakes models make most often on set_range_values
 * (precisely the op used to modify existing cells) so they validate instead of
 * being dropped:
 *  - `values` given as a 1D array (["a","b"]) → wrap into one row ([["a","b"]]).
 *  - `values` given as a bare scalar (2500) → single cell ([[2500]]).
 * Anything already well-shaped (a 2D array) passes through untouched. Non-objects
 * and other op types are returned as-is for the strict schema to accept or reject.
 */
export function normalizeRawOp(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const op = raw as Record<string, unknown>;
  if (op.type !== 'set_range_values') return raw;

  let values = op.values;
  if (!Array.isArray(values)) {
    // scalar → [[scalar]]
    values = [[values]];
  } else if (!values.some((row) => Array.isArray(row))) {
    // 1D row array → [[...]]
    values = [values];
  }
  return { ...op, values };
}

/**
 * Plan sheet operations for a user request. Returns a validated
 * SheetOperation[] (possibly empty). Throws only on provider/model failure.
 */
export async function generateSheetOperations(opts: {
  userPrompt: string;
  sheetContext: string;
  referenceContent?: string | null;
}): Promise<SheetOperation[]> {
  const { userPrompt, sheetContext, referenceContent } = opts;

  if (!isProviderConfigured(SHEET_AI_PROVIDER)) {
    throw new Error(
      'Sheet AI requires Mistral Medium 3.5, but the Mistral provider is not configured (MISTRAL_API_KEY missing)'
    );
  }
  const model = getModel(SHEET_AI_PROVIDER, SHEET_AI_MODEL);
  log.info(`[SheetAI] Using Mistral Medium 3.5 (${SHEET_AI_MODEL})`);

  const referenceSection = referenceContent?.trim()
    ? `\n\nZUSÄTZLICHER KONTEXT (vorherige Antwort des Assistenten, auf die sich der*die Nutzer*in bezieht):\n<reference_content>\n${referenceContent.trim().slice(0, 8000)}\n</reference_content>`
    : '';

  const system = `${SHEET_TOOL_STRICT_PROMPT}\n\nAKTUELLER TABELLEN-ZUSTAND:\n${sheetContext.slice(0, 24_000)}${referenceSection}`;

  const result = await generateText({
    model,
    system,
    prompt: userPrompt,
    tools: {
      applySheetOperations: tool({
        description:
          'Apply a batch of spreadsheet operations. Each item is one operation object with a "type" field (set_range_values, set_formula, format_range, add_sheet, clear_range) as documented in the system prompt.',
        // Deliberately lenient: accept the raw array so a single malformed op
        // does not make the SDK reject the WHOLE tool call (which would surface
        // as a hard error / drop every valid op with it). We validate each op
        // ourselves below against sheetOperationSchema and keep the good ones.
        // The precise op shapes are enumerated in the system prompt.
        inputSchema: z.object({ operations: z.array(z.unknown()).max(50) }),
      }),
    },
    toolChoice: 'required',
    maxOutputTokens: 8000,
    maxRetries: 1,
    temperature: 0.2,
  });

  const toolCall = result.toolCalls.find((tc) => tc.toolName === 'applySheetOperations');
  const rawOps = toolCall ? (toolCall.input as { operations?: unknown[] }).operations : undefined;

  // Per-op validation: keep every valid operation, drop (and log) only the
  // malformed ones — one bad op must never silently discard a whole batch.
  const captured: SheetOperation[] = [];
  const dropped: string[] = [];
  for (const raw of Array.isArray(rawOps) ? rawOps : []) {
    const parsed = sheetOperationSchema.safeParse(normalizeRawOp(raw));
    if (parsed.success) captured.push(parsed.data);
    else
      dropped.push(
        `${parsed.error.issues[0]?.message ?? 'invalid'} :: ${JSON.stringify(raw).slice(0, 160)}`
      );
  }

  if (dropped.length > 0) {
    log.warn(`[SheetAI] Dropped ${dropped.length} malformed operation(s): ${dropped.join(' | ')}`);
  }
  // When the model plans nothing, surface WHY (empty tool call vs. no tool call
  // vs. all-dropped) — the frontend can only show "keine Änderung", so the
  // diagnosis has to live in the logs.
  if (captured.length === 0) {
    log.warn(
      `[SheetAI] 0 operations for prompt "${userPrompt}" — finish=${result.finishReason}, ` +
        `toolCall=${toolCall ? 'yes' : 'no'}, rawOpsCount=${Array.isArray(rawOps) ? rawOps.length : 'n/a'}, ` +
        `dropped=${dropped.length}, contextChars=${sheetContext.length}, ` +
        `modelText=${JSON.stringify(result.text.slice(0, 200))}`
    );
  }

  log.info(`[SheetAI] Planned ${captured.length} operation(s) for prompt: "${userPrompt}"`);
  return captured;
}
