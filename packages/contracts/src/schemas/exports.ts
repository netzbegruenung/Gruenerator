/**
 * Zod schemas for document export endpoints.
 * Mirrors the schemas in apps/api/routes/exports/docxController.ts and pdfController.ts.
 */
import { z } from 'zod';

// ── Shared citation schema ──────────────────────────────────────────────────

export const citationSchema = z.object({
  index: z.string(),
  document_title: z.string().optional(),
  cited_text: z.string().optional(),
  similarity_score: z.number().optional(),
  source_url: z.string().optional(),
});

// ── Request bodies ──────────────────────────────────────────────────────────

export const docxExportBodySchema = z.object({
  content: z.string(),
  title: z.string().optional(),
  citations: z.array(citationSchema).optional(),
});

/**
 * How the exported PDF is laid out.
 *  'document'   — plain, CI-styled document (the default, and the old behaviour)
 *  'letterhead' — the same layout PLUS the caller's Absender block. Deliberately
 *                 NOT a letter: no recipient, no date line, no subject, no
 *                 salutation. A letterhead does not make a document a letter.
 *  'letter'     — full DIN-5008 letter, driven by the `letter` fields below.
 */
export const pdfExportLayoutSchema = z.enum(['document', 'letterhead', 'letter']);
export type PdfExportLayout = z.infer<typeof pdfExportLayoutSchema>;

export const pdfExportLetterSchema = z.object({
  recipient: z.string().max(600).optional(),
  place: z.string().max(200).optional(),
  subject: z.string().max(400).optional(),
  salutation: z.string().max(300).optional(),
  closing: z.string().max(200).optional(),
  signature: z.string().max(400).optional(),
});

export const pdfExportBodySchema = z.object({
  content: z.string(),
  title: z.string().optional(),
  /**
   * Both optional so every existing caller keeps working — apps/mobile posts
   * `{content, title}` and the backward compatibility is pinned by
   * exportsContract.vitest.ts.
   *
   * Note there is no `name` anywhere in this body. Organisation and address may
   * be chosen (letterheadId) or typed (letterhead) by the caller — both are
   * their own data either way — but the NAME on the letterhead is always
   * resolved server-side from the authenticated profile, so nobody can sign as
   * somebody else.
   */
  layout: pdfExportLayoutSchema.optional(),
  letter: pdfExportLetterSchema.optional(),
  /** One of the caller's saved letterheads; omitted uses their default. */
  letterheadId: z.string().optional(),
  /**
   * Typed in the export dialog for this export only. Organisation and address
   * only — the NAME always comes from the profile, so nobody can sign as
   * somebody else.
   */
  letterhead: z
    .object({
      organization: z.string().max(120).optional(),
      address: z.string().max(300).optional(),
    })
    .optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

/**
 * Binary file responses are typed as `unknown` because ts-rest does not model
 * binary blobs in the schema layer — the actual response will be a Buffer/Blob.
 * Consumers must use `responseType: 'blob'` (axios) or handle the raw Response.
 */
export const binaryFileResponseSchema = z.unknown();

export const exportErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.string().optional(),
});
