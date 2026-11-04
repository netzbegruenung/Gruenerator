/**
 * Sheet AI service
 *
 * Turns a natural-language spreadsheet-edit request into a list of structured
 * sheet operations (SheetOperation[]). The operations are applied CLIENT-SIDE
 * by the sheets editor via the Univer Facade API (and then flow through the
 * mutation-log collab bridge) — this service only plans them.
 *
 * Mirrors boards/boardAiService.ts (plan-then-apply, plain JSON, no streaming),
 * routed through the facade (lane `editor_ops_sheet`) rather than calling the
 * AI SDK directly — see services/ai/generate.ts. The forced tool call runs
 * through `aiObject`, so a malformed op earns a repair turn that names the
 * field error instead of being dropped silently (#4470). The lane always primes on Mistral Medium 3.5 (the
 * model this planner needs — smaller fallbacks mis-shape or drop
 * set_range_values ops), but unlike the previous pinned, chain-less provider
 * check, a lane always carries the facade's generic fallback chain: an
 * unavailable Mistral now falls back to cortecs/melious instead of failing
 * loudly (#3426).
 */

import { sheetOperationSchema, type SheetOperation } from '@gruenerator/contracts';
import { z } from 'zod';

import { aiObject } from '../../services/ai/generate.js';
import { toolInputJsonSchema } from '../../services/ai/toolJsonSchema.js';
import { createLogger } from '../../utils/logger.js';

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
- { "type": "format_range", "range": "A1:C1", "bold"?: true, "italic"?: true, "textLine"?: "underline"|"strikethrough"|"none", "fontSize"?: 14, "background"?: "#e8f5e9", "fontColor"?: "#1b5e20", "horizontalAlign"?: "left"|"center"|"right", "verticalAlign"?: "top"|"middle"|"bottom", "wrap"?: true, "border"?: { "edges": "all"|"outside"|"inside"|"top"|"bottom"|"left"|"right"|"none", "style"?: "thin"|"medium"|"thick"|"dashed"|"dotted"|"double", "color"?: "#000000" }, "sheet"?: "Name" }
    // set only the properties the user asked for. "Rahmen" → border edges "all"; "Rahmen außen" → "outside"
- { "type": "clear_format", "range": "A1:D20", "sheet"?: "Name" }   // removes ALL formatting, values stay
- { "type": "add_sheet", "name": "Blatt 2" }
- { "type": "rename_sheet", "name": "Neuer Name", "sheet"?: "Alter Name" }
- { "type": "delete_sheet", "sheet": "Name" }   // only on an explicit request to delete that sheet
- { "type": "duplicate_sheet", "sheet"?: "Name", "name"?: "Kopie" }
- { "type": "set_tab_color", "color": "#2e7d32", "sheet"?: "Name" }
- { "type": "clear_range", "range": "B2:B5", "sheet"?: "Name" }
- { "type": "freeze_panes", "rows": 1, "columns": 0, "sheet"?: "Name" }
    // keeps the first rows/columns visible while scrolling ("Kopfzeile fixieren" → rows:1). rows:0 + columns:0 unfreezes.
- { "type": "set_column_width", "at": "A", "count": 3, "width"?: 160, "sheet"?: "Name" }
    // width in px; OMIT width to fit the columns to their content ("Spaltenbreite anpassen")
- { "type": "set_row_height", "at": 1, "count": 1, "height"?: 40, "sheet"?: "Name" }   // omit height to fit content
- { "type": "autofill", "source": "A2:A3", "target": "A2:A20", "sheet"?: "Name" }
    // continues a pattern like the fill handle (1,2 → 3,4…; Mo,Di → Mi…; dates; relative formulas). target INCLUDES source.
- { "type": "find_replace", "find": "Altstadt", "replace": "Innenstadt", "matchCase"?: false, "entireCell"?: false }
    // replaces text in the ACTIVE sheet's cell values
- { "type": "set_hyperlink", "cell": "B2", "url": "https://gruene.de", "label"?: "Website", "sheet"?: "Name" }   // http(s) or mailto only
- { "type": "set_note", "cell": "C4", "text": "Quelle: Haushaltsplan 2026", "sheet"?: "Name" }   // text "" removes the note
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
    //   { "kind": "color_scale", "minColor": "#f8696b", "midColor"?: "#ffeb84", "maxColor": "#63be7b" }   // heatmap / Ampel over all values
    //   { "kind": "data_bar", "color": "#46962b", "negativeColor"?: "#e53935", "gradient"?: true }   // in-cell bars
- { "type": "remove_conditional_formats", "range": "B2:B20", "sheet"?: "Name" }   // removes the rules on that range
- { "type": "set_data_validation", "range": "C2:C50", "rule": {...}, "sheet"?: "Name" }
    // restricts what may be entered. "rule" is one of:
    //   { "kind": "list", "values": ["Ja","Nein","Offen"], "multiple"?: false }   // dropdown
    //   { "kind": "checkbox" }
    //   { "kind": "number", "operator": "between"|"not_between"|"greater_than"|"greater_equal"|"less_than"|"less_equal"|"equal"|"not_equal", "value": 0, "value2"?: 100 }
    //   { "kind": "date", "operator": "after"|"before"|"between"|"equal"|"on_or_after"|"on_or_before", "date": "2026-01-01", "date2"?: "2026-12-31" }
- { "type": "remove_data_validation", "range": "C2:C50", "sheet"?: "Name" }
- { "type": "remove_filter", "sheet"?: "Name" }
- { "type": "remove_table", "name": "Umsätze" }   // the table NAME from "Tabellen" in the sheet structure; values stay

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
- "Markiert:" in the sheet state is the person's current selection. When the request says "das hier", "die markierten Zellen", "diese Spalte/Zeile" or names no range at all, apply it to that selection.
- "Struktur des aktiven Blatts" lists what already exists (filter, tables, rules, validation, notes, frozen panes, merged cells, formula errors). Do not add a second filter or a duplicate rule; to change a rule, remove it and add the new one. "warum Fehler/#DIV/0!" → fix the formula with set_formula.
- Write German content with gender-inclusive language (Genderstern *) where text is generated.
- The user is explicitly asking for a change — emit the operations that carry it out. Only return an empty array if the request is truly impossible or requires no change.
- Return ONLY the tool call. No prose.

EXAMPLE 1 — the sheet has "Umsatz" in A1 and 1000 in B1, and the user says "ändere den Umsatz auf 2500":
{ "operations": [ { "type": "set_range_values", "range": "B1", "values": [[2500]] } ] }
EXAMPLE 2 — user says "formatiere Spalte B als Euro":
{ "operations": [ { "type": "set_number_format", "range": "B2:B100", "pattern": "#,##0.00\\ [$€-407]" } ] }
EXAMPLE 3 — user says "schreibe das Datum 2026-03-15 in E1 und in E2 den Folgetag":
{ "operations": [ { "type": "set_range_values", "range": "E1", "values": [["2026-03-15"]] }, { "type": "set_formula", "cell": "E2", "formula": "=E1+1" }, { "type": "set_number_format", "range": "E1:E2", "pattern": "dd.MM.yyyy" } ] }
EXAMPLE 4 — the header is in A1:E1 and the user says "mach die Kopfzeile schick und fixier sie":
{ "operations": [ { "type": "format_range", "range": "A1:E1", "bold": true, "background": "#46962b", "fontColor": "#ffffff", "horizontalAlign": "center", "border": { "edges": "bottom", "style": "medium" } }, { "type": "freeze_panes", "rows": 1, "columns": 0 }, { "type": "set_column_width", "at": "A", "count": 5 } ] }`;

/**
 * Coerce the shape mistakes models make most often so the op validates
 * instead of being dropped:
 *  - fields nested under the op's own name (`{ "type": "format_range",
 *    "format_range": { "range": "A1:C1" } }`, seen from the cortecs fallback in
 *    #4470) → hoisted to the top level.
 *  - set_range_values (precisely the op used to modify existing cells):
 *    `values` given as a 1D array (["a","b"]) → wrap into one row ([["a","b"]]);
 *    `values` given as a bare scalar (2500) → single cell ([[2500]]).
 * Anything already well-shaped passes through untouched. Non-objects are
 * returned as-is for the strict schema to accept or reject.
 */
export function normalizeRawOp(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let op = raw as Record<string, unknown>;
  const nested = typeof op.type === 'string' ? op[op.type] : undefined;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const { [op.type as string]: _nested, ...rest } = op;
    op = { ...(nested as Record<string, unknown>), ...rest };
  }
  if (op.type !== 'set_range_values') return op;

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

interface PlannedOps {
  captured: SheetOperation[];
  /** One line per malformed op: what is wrong, then the op as sent. */
  dropped: string[];
  rawCount: number;
}

/** Validate each op on its own — one bad op must never discard the batch. */
function validateOps(rawOps: unknown[]): PlannedOps {
  const captured: SheetOperation[] = [];
  const dropped: string[] = [];
  rawOps.forEach((raw, index) => {
    const parsed = sheetOperationSchema.safeParse(normalizeRawOp(raw));
    if (parsed.success) {
      captured.push(parsed.data);
      return;
    }
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    dropped.push(
      `Operation ${index + 1}: ${where}${issue?.message ?? 'invalid'} :: ${JSON.stringify(raw).slice(0, 160)}`
    );
  });
  return { captured, dropped, rawCount: rawOps.length };
}

/**
 * Plan sheet operations for a user request. Returns a validated
 * SheetOperation[] (possibly empty). Throws only on provider failure.
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

  const result = await aiObject<PlannedOps>({
    lane: 'editor_ops_sheet',
    system,
    prompt: userPrompt,
    toolName: TOOL_NAME,
    toolDescription:
      'Apply a batch of spreadsheet operations. Each item is one operation object with a "type" field (one of the operation types documented in the system prompt).',
    // Deliberately lenient (`unknown` items): the strictness lives in
    // `validate`, per op.
    schema: toolInputJsonSchema(OPERATIONS_SCHEMA),
    temperature: 0.2,
    label: 'SheetAI',
    validate: (input, attempt, attempts) => {
      const envelope = OPERATIONS_SCHEMA.safeParse(input);
      if (!envelope.success) {
        return {
          ok: false,
          error: 'Erwartet wird { "operations": [ ... ] } mit höchstens 50 Operationen',
        };
      }
      const planned = validateOps(envelope.data.operations);
      // A malformed op gets a repair turn that names the field (#4470). The
      // last attempt keeps the valid ones rather than losing the whole edit.
      if (planned.dropped.length > 0 && attempt < attempts) {
        return {
          ok: false,
          error: `${planned.dropped.length} Operation(en) passen nicht zum Schema — korrigiere sie und gib alle Operationen erneut aus:\n${planned.dropped.join('\n')}`,
        };
      }
      return { ok: true, value: planned };
    },
  });

  if (!result.ok) {
    if (result.cause) throw result.cause;
    // No usable tool call on any attempt: the frontend can only show
    // "keine Änderung", so the diagnosis has to live in the logs.
    log.warn(
      `[SheetAI] 0 operations for prompt "${userPrompt}" — no usable tool call: ${result.error}`
    );
    return [];
  }

  const { captured, dropped, rawCount } = result.data;
  if (dropped.length > 0) {
    log.warn(`[SheetAI] Dropped ${dropped.length} malformed operation(s): ${dropped.join(' | ')}`);
  }
  if (captured.length === 0) {
    log.warn(
      `[SheetAI] 0 operations for prompt "${userPrompt}" — rawOpsCount=${rawCount}, ` +
        `dropped=${dropped.length}, contextChars=${sheetContext.length}`
    );
  }

  log.info(`[SheetAI] Planned ${captured.length} operation(s) for prompt: "${userPrompt}"`);
  return captured;
}
