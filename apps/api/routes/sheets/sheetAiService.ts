/**
 * Sheet AI service
 *
 * Turns a natural-language spreadsheet-edit request into a list of structured
 * sheet operations (SheetOperation[]). The operations are applied CLIENT-SIDE
 * by the sheets editor via the Univer Facade API (and then flow through the
 * mutation-log collab bridge) — this service only plans them.
 *
 * Mirrors boards/boardAiService.ts (plan-then-apply, plain JSON, no streaming),
 * routed through the facade (`aiTools`, lane `editor_ops_sheet`) rather than
 * calling the AI SDK directly — see services/ai/generate.ts. The lane always
 * primes on Mistral Medium 3.5 (the model this planner needs — smaller
 * fallbacks mis-shape or drop set_range_values ops), but unlike the previous
 * pinned, chain-less provider check, a lane always carries the facade's
 * generic fallback chain: an unavailable Mistral now falls back to
 * cortecs/melious instead of failing loudly. See the stage-3 report for that
 * trade-off.
 */

import { sheetOperationSchema, type SheetOperation } from '@gruenerator/contracts';
import { jsonSchema } from 'ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { aiTools } from '../../services/ai/generate.js';
import { createLogger } from '../../utils/logger.js';

import type { AiResult, Tool } from '../../services/ai/types.js';

const log = createLogger('SheetAI');

/** Exportiert nur, damit der Konsistenz-Wächter den FERTIGEN Prompt lesen kann
 *  statt seiner Bausteine — siehe `sheetAiService.vitest.ts`. */
export const SHEET_TOOL_STRICT_PROMPT = `You translate a user's request into spreadsheet operations by calling the tool applySheetOperations.

You MUST respond ONLY by calling applySheetOperations with { "operations": [ ... ] }.

Permitted operation types (each object needs a "type" field):
- { "type": "set_range_values", "range": "A1:C3", "values": [[...],[...]], "asText"?: false, "sheet"?: "Name" }
    // range in A1 notation; values is a 2D array (array of rows) matching the range shape
    // asText:true forces TEXT for ids, ZIP, phone numbers, leading zeros, or codes like "2-2"
- { "type": "set_formula", "cell": "D2", "formula": "=SUM(A1:A10)", "sheet"?: "Name" }
    // single cell; formula starts with "=" and uses A1 references
- { "type": "set_number_format", "range": "B2:B20", "pattern": "#,##0.00\\ [$€-407]", "sheet"?: "Name" }
    // DISPLAY format only, never changes the stored value. Patterns:
    // "#,##0.00\\ [$€-407]"=Euro (German separators: 1.234,56 €), "0%"=Prozent,
    // "dd.MM.yyyy"=Datum, "#,##0"=Tausender, "@"=Text
- { "type": "format_range", "range": "A1:C1", "bold"?: true, "background"?: "#e8f5e9", "fontColor"?: "#1b5e20", "sheet"?: "Name" }
- { "type": "add_sheet", "name": "Blatt 2" }
- { "type": "clear_range", "range": "B2:B5", "sheet"?: "Name" }
- { "type": "insert_rows", "at": 5, "count": 2, "sheet"?: "Name" }
    // inserts "count" rows BEFORE 1-based row "at" (existing rows shift down).
    // "2 Zeilen unter Zeile 5 einfügen" → at:6
- { "type": "delete_rows", "at": 5, "count": 1, "sheet"?: "Name" }   // deletes from 1-based row "at"
- { "type": "insert_columns", "at": "C", "count": 1, "sheet"?: "Name" }   // "at" is a column LETTER; inserts before it
- { "type": "delete_columns", "at": "C", "count": 1, "sheet"?: "Name" }
- { "type": "merge_cells", "range": "A1:C1", "sheet"?: "Name" }   // e.g. a title row; keeps the top-left value
- { "type": "unmerge_cells", "range": "A1:C1", "sheet"?: "Name" }
- { "type": "sort_range", "range": "A1:D20", "column": "B", "ascending": true, "sheet"?: "Name" }
    // sorts the rows of "range" by the values in "column" (a letter INSIDE range).
    // Include the header row in "range"; it is kept in place.
- { "type": "create_filter", "range": "A1:E30", "sheet"?: "Name" }
    // turns on the auto-filter (header dropdowns) over "range". Include the header row.
- { "type": "add_table", "range": "A1:E30", "name"?: "Umsätze", "sheet"?: "Name" }
    // turns "range" into a STRUCTURED table object (Excel "Als Tabelle formatieren"):
    // header row + banded rows + built-in filter dropdowns + auto-expand. Only for an
    // explicit "als Tabelle formatieren" ask — normal data entry does NOT need this.
- { "type": "add_conditional_format", "range": "B2:B20", "rule": {...}, "sheet"?: "Name" }
    // colors cells that match a rule. "rule" is one of:
    //   { "kind": "cell_number", "operator": "greater_than"|"greater_equal"|"less_than"|"less_equal"|"equal"|"not_equal"|"between"|"not_between", "value": 100, "value2"?: 200 (upper bound for between), "background"?: "#ffcdd2", "fontColor"?: "#b71c1c", "bold"?: true }
    //   { "kind": "text_contains", "text": "offen", "background"?: "#fff9c4", "fontColor"?: "#000", "bold"?: true }
- { "type": "set_data_validation", "range": "C2:C50", "rule": {...}, "sheet"?: "Name" }
    // restricts what may be entered. "rule" is one of:
    //   { "kind": "list", "values": ["Ja","Nein","Offen"], "multiple"?: false }   // dropdown
    //   { "kind": "checkbox" }
    //   { "kind": "number", "operator": "between"|"not_between"|"greater_than"|"greater_equal"|"less_than"|"less_equal"|"equal"|"not_equal", "value": 0, "value2"?: 100 }
    //   { "kind": "date", "operator": "after"|"before"|"between"|"equal"|"on_or_after"|"on_or_before", "date": "2026-01-01", "date2"?: "2026-12-31" }

RULES:
- Diagramme (add_chart) sind derzeit DEAKTIVIERT — biete keine Diagramme an und gib KEINE add_chart-Operation aus. Wenn ein Diagramm gewünscht wird, sag knapp, dass Diagramme aktuell nicht verfügbar sind, und biete stattdessen die aufbereiteten Daten/eine Auswertung an.
- Ranges/cells ALWAYS in A1 notation. Row 1 is the first row, column A the first column.
- The "AKTUELLER TABELLEN-ZUSTAND" below shows the existing values at their A1 coordinates. To CHANGE existing data, emit set_range_values (or set_formula) targeting exactly those coordinates — this OVERWRITES them. Do not overwrite unrelated cells.
- "values" MUST be a 2D array even for a single cell: a single value is [["x"]], one row is [["a","b","c"]], one column is [["a"],["b"],["c"]].
- In set_range_values, a string starting with "=" is treated as a formula.
- Numbers must be JSON numbers (1234.5), not localized strings.
- CURRENCY and PERCENT are a NUMBER plus a number format, never a formatted string: write the numeric value with set_range_values AND apply set_number_format. Never write "1.000 €" or "25%" as text into a numeric column — it breaks formulas, sorting and export. (25% is the number 0.25 with pattern "0%"; Euro uses pattern "#,##0.00\\ [$€-407]".)
- DATES: write the plain ISO string "yyyy-MM-dd" (or "yyyy-MM-ddTHH:mm") as the VALUE in set_range_values AND apply a date set_number_format (e.g. "dd.MM.yyyy"). The platform converts the ISO string to the correct date value deterministically — do NOT compute or emit an Excel serial number yourself, you will get it wrong.
- When a formula's result should read as a date, currency or percent (e.g. "=E1+1" over a date cell), ALSO emit a set_number_format on the formula cell — Univer does not inherit the format of referenced cells.
- The "Spalten-Typen" note in the sheet state marks which columns are Währung/Prozent/Datum/Formel — respect those types when you change them.
- For ids, ZIP codes, phone numbers, leading zeros, or codes like "2-2", use set_range_values with asText:true so they are not auto-converted to numbers/dates.
- "sheet" is the sheet NAME; omit it to target the active sheet.
- Use the right tool for the ask: "markiere/färbe Werte über/unter X" → add_conditional_format (cell_number); "Dropdown/nur Ja-Nein/Auswahlliste" → set_data_validation (list/checkbox); "sortiere nach Spalte" → sort_range; "Filter setzen" → create_filter; "als Tabelle formatieren" → add_table. Colors are CSS hex ("#ffcdd2"). These do NOT overwrite cell values.
- Write German content with gender-inclusive language (Genderstern *) where text is generated.
- The user is explicitly asking for a change — emit the operations that carry it out. Only return an empty array if the request is truly impossible or requires no change.
- Return ONLY the tool call. No prose.

EXAMPLE 1 — the sheet has "Umsatz" in A1 and 1000 in B1, and the user says "ändere den Umsatz auf 2500":
{ "operations": [ { "type": "set_range_values", "range": "B1", "values": [[2500]] } ] }
EXAMPLE 2 — user says "formatiere Spalte B als Euro":
{ "operations": [ { "type": "set_number_format", "range": "B2:B100", "pattern": "#,##0.00\\ [$€-407]" } ] }
EXAMPLE 3 — user says "schreibe das Datum 2026-03-15 in E1 und in E2 den Folgetag":
{ "operations": [ { "type": "set_range_values", "range": "E1", "values": [["2026-03-15"]] }, { "type": "set_formula", "cell": "E2", "formula": "=E1+1" }, { "type": "set_number_format", "range": "E1:E2", "pattern": "dd.MM.yyyy" } ] }`;

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

const TOOL_NAME = 'applySheetOperations';
const OPERATIONS_SCHEMA = z.object({ operations: z.array(z.unknown()).max(50) });

/** How many times the forced tool call is attempted — one retry, as before. */
const MAX_ATTEMPTS = 2;

/** The tool call by NAME, in either transport shape the adapters produce. */
function extractToolInput(result: AiResult): { operations?: unknown[] } | null {
  const call = result.tool_calls?.find((c) => c.name === TOOL_NAME);
  if (call) return call.input as { operations?: unknown[] };
  for (const block of result.raw_content_blocks ?? []) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME && block.input) {
      return block.input as { operations?: unknown[] };
    }
  }
  return null;
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

  const referenceSection = referenceContent?.trim()
    ? `\n\nRECHERCHIERTE QUELLEN (Faktenbasis für die Bearbeitung — übernimm konkrete Zahlen, Namen und Fakten WÖRTLICH aus diesen Quellen; erfinde keine Beispielwerte):\n<recherchierte_quellen>\n${referenceContent.trim().slice(0, 8000)}\n</recherchierte_quellen>`
    : '';

  const system = `${SHEET_TOOL_STRICT_PROMPT}\n\nAKTUELLER TABELLEN-ZUSTAND:\n${sheetContext.slice(0, 24_000)}${referenceSection}`;

  // jsonSchema() wrapping is required — the AI SDK's asSchema helper rejects
  // raw JSON-Schema objects (see toolForcedEdit.ts). Deliberately lenient
  // (`z.unknown()` items): a single malformed op must not make the whole tool
  // call unusable. We validate each op ourselves below against
  // sheetOperationSchema and keep the good ones.
  const rawSchema = zodToJsonSchema(OPERATIONS_SCHEMA, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  const tool: Tool = {
    name: TOOL_NAME,
    description:
      'Apply a batch of spreadsheet operations. Each item is one operation object with a "type" field (one of the operation types documented in the system prompt).',
    input_schema: jsonSchema(
      rawSchema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  let toolInput: { operations?: unknown[] } | null = null;
  let lastResult: AiResult | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await aiTools({
        lane: 'editor_ops_sheet',
        system,
        prompt: userPrompt,
        tools: [tool],
        toolChoice: 'required',
        temperature: 0.2,
      });
      lastResult = result;
      toolInput = extractToolInput(result);
      if (toolInput) break;
      log.warn(
        `[SheetAI] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
      );
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      log.warn(`[SheetAI] attempt ${attempt} threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const rawOps = toolInput ? toolInput.operations : null;

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
      `[SheetAI] 0 operations for prompt "${userPrompt}" — finish=${lastResult?.stop_reason ?? 'n/a'}, ` +
        `toolCall=${toolInput ? 'yes' : 'no'}, rawOpsCount=${Array.isArray(rawOps) ? rawOps.length : 'n/a'}, ` +
        `dropped=${dropped.length}, contextChars=${sheetContext.length}, ` +
        `modelText=${JSON.stringify((lastResult?.content ?? '').slice(0, 200))}`
    );
  }

  log.info(`[SheetAI] Planned ${captured.length} operation(s) for prompt: "${userPrompt}"`);
  return captured;
}
