import { z } from 'zod';

/**
 * Sheets AI (Univer spreadsheets). The chat cannot edit the sheet itself —
 * POST /api/sheets/:id/ai turns a natural-language request into a list of
 * sheet operations, which the sheets editor applies client-side via the
 * Univer Facade API (they then flow through the mutation-log collab bridge).
 * Mirrors the boards AI plan-then-apply pattern (schemas/boards.ts).
 */

export const sheetCellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export type SheetCellValue = z.infer<typeof sheetCellValueSchema>;

export const sheetOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set_range_values'),
    /** A1 notation, e.g. "A1:C3". Strings starting with '=' are formulas. */
    range: z.string(),
    values: z.array(z.array(sheetCellValueSchema)),
    /**
     * Force every written cell to TEXT identity (Univer CellValueType.FORCE_STRING).
     * Use for IDs, ZIP codes, leading-zero codes, phone numbers, or scores like
     * "2-2" that must NOT auto-convert to a number or date. Omit for normal data.
     */
    asText: z.boolean().nullish(),
    /** Target sheet name; active sheet when omitted. */
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('set_number_format'),
    /** A1 notation, e.g. "B2:B20". */
    range: z.string(),
    /**
     * Excel/Univer number-format pattern applied to the range (display only —
     * never changes the stored logical value). Examples: "#,##0.00\ [$€-407]"
     * (Euro, German separators), "0%" (percent), "dd.MM.yyyy" (date),
     * "#,##0" (thousands), "@" (text).
     */
    pattern: z.string(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('set_formula'),
    /** Single cell in A1 notation, e.g. "D2". */
    cell: z.string(),
    /** Formula string starting with '=', e.g. "=SUM(A1:A10)". */
    formula: z.string(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('format_range'),
    range: z.string(),
    bold: z.boolean().nullish(),
    /** CSS color, e.g. "#e8f5e9". */
    background: z.string().nullish(),
    fontColor: z.string().nullish(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('add_sheet'),
    name: z.string(),
  }),
  z.object({
    type: z.literal('clear_range'),
    range: z.string(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('add_chart'),
    /**
     * A1 data range including header row and label column, e.g. "A1:D5" where
     * row 1 = series headers and column A = category labels.
     */
    range: z.string(),
    chartType: z.enum(['bar', 'line', 'area', 'pie', 'donut']),
    title: z.string().nullish(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('insert_rows'),
    /** 1-based row number; `count` new rows are inserted BEFORE it (existing
     * rows shift down). "unter Zeile 5 einfügen" → at = 6. */
    at: z.number().int().positive(),
    count: z.number().int().positive(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('delete_rows'),
    /** 1-based row number of the first row to delete. */
    at: z.number().int().positive(),
    count: z.number().int().positive(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('insert_columns'),
    /** Column letter; `count` new columns are inserted BEFORE it. */
    at: z.string(),
    count: z.number().int().positive(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('delete_columns'),
    /** Column letter of the first column to delete. */
    at: z.string(),
    count: z.number().int().positive(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('merge_cells'),
    /** A1 range merged into one cell (top-left value kept). */
    range: z.string(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('unmerge_cells'),
    range: z.string(),
    sheet: z.string().nullish(),
  }),
  // --- Plugin-backed ops (require the free Univer presets, see createUniverInstance) ---
  z.object({
    type: z.literal('add_conditional_format'),
    /** A1 range the rule applies to, e.g. "B2:B20". */
    range: z.string(),
    rule: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('cell_number'),
        operator: z.enum([
          'greater_than',
          'greater_equal',
          'less_than',
          'less_equal',
          'equal',
          'not_equal',
          'between',
          'not_between',
        ]),
        value: z.number(),
        /** Upper bound for 'between'/'not_between'. */
        value2: z.number().nullish(),
        /** CSS color for matched cells' background, e.g. "#ffcdd2". */
        background: z.string().nullish(),
        fontColor: z.string().nullish(),
        bold: z.boolean().nullish(),
      }),
      z.object({
        kind: z.literal('text_contains'),
        text: z.string(),
        background: z.string().nullish(),
        fontColor: z.string().nullish(),
        bold: z.boolean().nullish(),
      }),
    ]),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('set_data_validation'),
    /** A1 range the validation applies to, e.g. "C2:C50". */
    range: z.string(),
    rule: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('list'),
        /** Allowed values (dropdown). */
        values: z.array(z.string()).min(1),
        /** Allow selecting more than one value. */
        multiple: z.boolean().nullish(),
      }),
      z.object({ kind: z.literal('checkbox') }),
      z.object({
        kind: z.literal('number'),
        operator: z.enum([
          'between',
          'not_between',
          'greater_than',
          'greater_equal',
          'less_than',
          'less_equal',
          'equal',
          'not_equal',
        ]),
        value: z.number(),
        value2: z.number().nullish(),
      }),
      z.object({
        kind: z.literal('date'),
        operator: z.enum([
          'after',
          'before',
          'between',
          'equal',
          'on_or_after',
          'on_or_before',
        ]),
        /** ISO date (yyyy-mm-dd). */
        date: z.string(),
        /** Upper bound for 'between'. */
        date2: z.string().nullish(),
      }),
    ]),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('sort_range'),
    /** A1 range to sort, header row included, e.g. "A1:D20". */
    range: z.string(),
    /** Column letter to sort by (must lie inside `range`), e.g. "B". */
    column: z.string(),
    /** true = ascending (A→Z / 0→9), false = descending. */
    ascending: z.boolean(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('create_filter'),
    /** A1 range to enable an auto-filter on, header row included, e.g. "A1:E30". */
    range: z.string(),
    sheet: z.string().nullish(),
  }),
  z.object({
    type: z.literal('add_table'),
    /** A1 range to turn into a formatted table, header row included, e.g. "A1:E30". */
    range: z.string(),
    /** Display name; auto-generated when omitted. */
    name: z.string().nullish(),
    sheet: z.string().nullish(),
  }),
]);

export type SheetOperation = z.infer<typeof sheetOperationSchema>;

export const sheetOperationsSchema = z.array(sheetOperationSchema).max(50);

/**
 * Request body for POST /api/sheets/:id/ai. `sheetContext` is the serialized
 * (markdown) state of the workbook the frontend produced — the server never
 * reads the Y.Doc for live edits (frontend is the canonical editor).
 */
export const sheetAiRequestBodySchema = z.object({
  userPrompt: z.string(),
  sheetContext: z.string(),
  referenceContent: z.string().nullish(),
});

export type SheetAiRequestBody = z.infer<typeof sheetAiRequestBodySchema>;

export const sheetAiResponseSchema = z.object({
  operations: z.array(sheetOperationSchema),
});

export type SheetAiResponse = z.infer<typeof sheetAiResponseSchema>;

export const sheetErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

/**
 * Request body for POST /api/sheets/generate — a direct, non-chat generator
 * that produces a full spreadsheet from a natural-language description and
 * returns the created sheet document (Y.Doc seeded server-side). Mirrors
 * POST /api/docs/generate and POST /api/boards/generate.
 */
export const generateSheetBodySchema = z.object({
  description: z.string(),
});

export type GenerateSheetBody = z.infer<typeof generateSheetBodySchema>;

export const generateSheetResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export type GenerateSheetResponse = z.infer<typeof generateSheetResponseSchema>;
