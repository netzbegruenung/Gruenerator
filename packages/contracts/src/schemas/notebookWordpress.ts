/**
 * Zod schemas for the notebook WordPress-source endpoints.
 *
 * A WordPress site can be attached to a notebook as a source: the site's post
 * categories are discovered via the WP REST API, the user selects which to
 * import, and each post becomes a regular `documents` row (source_type
 * 'wordpress') attached to the notebook. See wordpressSiteRefSchema in
 * notebookCollections.ts for the persisted pointer.
 */
import { z } from 'zod';

import { wordpressCategoryRefSchema } from './notebookCollections.js';

export const wpDiscoverBodySchema = z.object({
  site_url: z.string(),
});

export const wpDiscoveredCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
  parent: z.number().nullish(),
});
export type WpDiscoveredCategory = z.infer<typeof wpDiscoveredCategorySchema>;

export const wpDiscoverResponseSchema = z.object({
  success: z.literal(true),
  site: z.object({ url: z.string(), name: z.string() }),
  categories: z.array(wpDiscoveredCategorySchema),
  total_posts: z.number(),
  total_pages: z.number(),
});
export type WpDiscoverResponse = z.infer<typeof wpDiscoverResponseSchema>;

export const wpImportBodySchema = z.object({
  site_url: z.string(),
  categories: z.array(wordpressCategoryRefSchema),
  all_posts: z.boolean(),
  pages: z.boolean(),
  /** ISO timestamp for incremental sync; null/omitted = full import of the latest 50 per scope. */
  modified_after: z.string().nullish(),
  /** Document ids the client already holds for this site — lets a full run compute removals. */
  known_document_ids: z.array(z.string()).nullish(),
  /** Remaining notebook document slots; the server caps new creations to this. */
  max_new_documents: z.number().nullish(),
});
export type WpImportBody = z.infer<typeof wpImportBodySchema>;

export const wpImportActionSchema = z.enum([
  'created',
  'updated',
  'unchanged',
  'failed',
  'skipped_full',
]);

export const wpImportResultItemSchema = z.object({
  documentId: z.string().nullable(),
  title: z.string(),
  sourceUrl: z.string(),
  action: wpImportActionSchema,
  oldDocumentId: z.string().nullish(),
  error: z.string().nullish(),
});
export type WpImportResultItem = z.infer<typeof wpImportResultItemSchema>;

export const wpImportResponseSchema = z.object({
  success: z.literal(true),
  results: z.array(wpImportResultItemSchema),
  /** Docs deleted server-side because they vanished from the selection (full runs only). */
  removed_document_ids: z.array(z.string()),
  created_count: z.number(),
  updated_count: z.number(),
  unchanged_count: z.number(),
  failed_count: z.number(),
  skipped_count: z.number(),
});
export type WpImportResponse = z.infer<typeof wpImportResponseSchema>;

export const wpErrorCodeSchema = z.enum([
  'invalid_url',
  'not_wordpress',
  'rest_disabled',
  'fetch_failed',
  'internal',
]);
export type WpErrorCode = z.infer<typeof wpErrorCodeSchema>;

export const wpErrorResponseSchema = z.object({
  error: z.string(),
  code: wpErrorCodeSchema.nullish(),
});
export type WpErrorResponse = z.infer<typeof wpErrorResponseSchema>;
