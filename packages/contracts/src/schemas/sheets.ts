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
     * never changes the stored logical value). Examples: "#,##0.00 €" (currency),
     * "0%" (percent), "yyyy-MM-dd" (date), "#,##0" (thousands), "@" (text).
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
