import { z } from 'zod';

/** `GET /api/canva/status` — the viewer's Canva connection. */
export const canvaStatusSchema = z.object({
  connected: z.boolean(),
  displayName: z.string().nullable(),
  connectedAt: z.string().nullable(),
  /** The grant lacks a scope the integration now asks for (e.g. `folder:write`). */
  needsReconnect: z.boolean(),
});
export type CanvaStatus = z.infer<typeof canvaStatusSchema>;

/**
 * `POST /api/canva/collections/:collectionId/export` — the stickers and
 * backgrounds of one Marktplatz collection, uploaded into a new folder of the
 * same name in the user's Canva uploads. A failed item does not stop the rest.
 */
export const canvaCollectionExportResponseSchema = z.object({
  folderName: z.string(),
  uploaded: z.number().int(),
  failed: z.array(z.object({ ref: z.string(), title: z.string() })),
});
export type CanvaCollectionExportResponse = z.infer<typeof canvaCollectionExportResponseSchema>;

/** A Canva id as the REST API hands it out (designs, brand templates). */
const canvaIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,50}$/);

/** Where an autofill starts: a design with data fields, or a brand template. */
export const canvaAutofillSourceSchema = z.object({
  kind: z.enum(['design', 'brand_template']),
  id: canvaIdSchema,
});
export type CanvaAutofillSource = z.infer<typeof canvaAutofillSourceSchema>;

/**
 * `GET /api/canva/autofill/sources` — what the connected plan allows, plus the
 * brand templates that have data fields. The user's own designs come from
 * `GET /api/canva/designs`.
 */
export const canvaAutofillSourcesResponseSchema = z.object({
  /** Canva Pro, Teams or Enterprise (`autofill` capability). */
  canAutofill: z.boolean(),
  /** `brand_template` capability. */
  canUseBrandTemplates: z.boolean(),
  brandTemplates: z.array(
    z.object({ id: z.string(), title: z.string(), thumbnailUrl: z.string().nullable() })
  ),
});
export type CanvaAutofillSourcesResponse = z.infer<typeof canvaAutofillSourcesResponseSchema>;

/**
 * `GET /api/canva/autofill/fields?kind=&id=` — the data fields of a source.
 * `supported: false` for chart, sheet and (for now) image fields: they keep the
 * template's own content.
 */
export const canvaAutofillFieldsResponseSchema = z.object({
  fields: z.array(z.object({ name: z.string(), type: z.string(), supported: z.boolean() })),
});
export type CanvaAutofillFieldsResponse = z.infer<typeof canvaAutofillFieldsResponseSchema>;

/** `POST /api/canva/autofill` — creates a NEW design; the source stays untouched. */
export const canvaAutofillRequestSchema = z.object({
  source: canvaAutofillSourceSchema,
  title: z.string().trim().max(255).optional(),
  /** Field name → text. A field left out keeps the template's own content. */
  texts: z.record(z.string().min(1).max(100), z.string().max(5000)),
});
export type CanvaAutofillRequest = z.infer<typeof canvaAutofillRequestSchema>;

export const canvaAutofillResponseSchema = z.object({
  design: z.object({
    title: z.string().nullable(),
    /** Temporary (30 days) and only valid for the user who made the request. */
    editUrl: z.string(),
    thumbnailUrl: z.string().nullable(),
  }),
  /** Free Canva plans get a few trial uses (a Canva preview feature). */
  trial: z.object({ usesRemaining: z.number().int(), upgradeUrl: z.string() }).nullable(),
});
export type CanvaAutofillResponse = z.infer<typeof canvaAutofillResponseSchema>;

/**
 * `POST /api/canva/autofill/suggest` — the source's text fields, filled by the
 * AI from what someone wrote in the Studio. A proposal to review, nothing is
 * sent to Canva.
 */
export const canvaAutofillSuggestRequestSchema = z.object({
  source: canvaAutofillSourceSchema,
  prompt: z.string().trim().min(1).max(4000),
});
export type CanvaAutofillSuggestRequest = z.infer<typeof canvaAutofillSuggestRequestSchema>;

export const canvaAutofillSuggestResponseSchema = z.object({
  texts: z.record(z.string(), z.string()),
});
export type CanvaAutofillSuggestResponse = z.infer<typeof canvaAutofillSuggestResponseSchema>;
