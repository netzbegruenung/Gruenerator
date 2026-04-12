import { z } from 'zod';

// ── Drive file (/drive/v3/files) ──────────────────────────────────────────────

export const googleDriveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.string().nullable().optional(),
  modifiedTime: z.string(),
  parents: z.array(z.string()).nullable().optional(),
  webViewLink: z.string().nullable().optional(),
});

export type GoogleDriveFile = z.infer<typeof googleDriveFileSchema>;

// ── File list (/drive/v3/files?q=…) ──────────────────────────────────────────

export const googleDriveFileListResponseSchema = z.object({
  files: z.array(googleDriveFileSchema),
  nextPageToken: z.string().optional(),
});

export type GoogleDriveFileListResponse = z.infer<typeof googleDriveFileListResponseSchema>;

// ── Search results (/drive/v3/files?q=fullText…) ─────────────────────────────

export const googleDriveSearchResponseSchema = z.object({
  files: z.array(googleDriveFileSchema),
});

export type GoogleDriveSearchResponse = z.infer<typeof googleDriveSearchResponseSchema>;

// ── Docs document (/v1/documents/:docId) ─────────────────────────────────────
// The Docs API returns a deeply nested document structure; we validate only the
// top-level shape and pass through the rest as unknown for flexibility.

export const googleDocsDocumentSchema = z.record(z.unknown());

export type GoogleDocsDocument = z.infer<typeof googleDocsDocumentSchema>;

// ── Sheets spreadsheet or range (/v4/spreadsheets/:id) ───────────────────────

export const googleSheetsResponseSchema = z.record(z.unknown());

export type GoogleSheetsResponse = z.infer<typeof googleSheetsResponseSchema>;
