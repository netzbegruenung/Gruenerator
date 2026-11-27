/**
 * Zod-Schemata der Tabellen-Reparatur (Admin, `/api/auth/admin/table-repair`).
 * Spiegelt apps/api/services/document-services/tableRepair.ts.
 *
 * Bewusst ohne Titel und Dateinamen: die Liste reicht über die Quellen aller
 * Nutzer*innen, angesehen wird eine einzelne im Chunk-Inspektor.
 */
import { z } from 'zod';

export const tableRepairStateSchema = z.enum([
  'fixable',
  'ok',
  'no_original',
  'wolke_unchecked',
  'unreadable',
]);
export type TableRepairState = z.infer<typeof tableRepairStateSchema>;

export const tableRepairSourceSchema = z.enum(['original', 'wolke', 'stored-text']);
export type TableRepairSource = z.infer<typeof tableRepairSourceSchema>;

export const tableRepairFindingSchema = z.object({
  documentId: z.string(),
  extension: z.string(),
  state: tableRepairStateSchema,
  source: tableRepairSourceSchema.nullable(),
  /** PDF: Seiten, die die neue Erkennung als Tabelle sieht und der gespeicherte Text nicht. */
  missedPages: z.array(z.number().int()),
});
export type TableRepairFinding = z.infer<typeof tableRepairFindingSchema>;

export const TABLE_REPAIR_SCAN_MAX = 25;
export const TABLE_REPAIR_BATCH_MAX = 50;

export const tableRepairScanBodySchema = z.object({
  cursor: z.string().uuid().nullable(),
  limit: z.number().int().min(1).max(TABLE_REPAIR_SCAN_MAX),
});

export const tableRepairScanResponseSchema = z.object({
  findings: z.array(tableRepairFindingSchema),
  nextCursor: z.string().nullable(),
  /** Nur beim ersten Aufruf (ohne Cursor) gezählt. */
  total: z.number().int().nullable(),
});
export type TableRepairScanResponse = z.infer<typeof tableRepairScanResponseSchema>;

export const tableRepairRepairBodySchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(TABLE_REPAIR_BATCH_MAX),
});

export const tableRepairResultStatusSchema = z.enum([
  'queued',
  'unavailable',
  'not_found',
  'consent_missing',
  'forbidden',
]);
export type TableRepairResultStatus = z.infer<typeof tableRepairResultStatusSchema>;

export const tableRepairRepairResponseSchema = z.object({
  results: z.array(z.object({ documentId: z.string(), status: tableRepairResultStatusSchema })),
});
export type TableRepairRepairResponse = z.infer<typeof tableRepairRepairResponseSchema>;

export const tableRepairErrorSchema = z.object({ success: z.boolean(), message: z.string() });
