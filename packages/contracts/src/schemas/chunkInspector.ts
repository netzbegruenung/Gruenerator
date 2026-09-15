/**
 * Zod-Schemata des admin-gesicherten Chunk-Inspektors. Spiegelt
 * apps/api/routes/admin/chunkInspectorContractRouter.ts.
 *
 * Leitsatz: hier steht ausschliesslich, was im Qdrant-Punkt bzw. in der
 * documents-Zeile liegt. `null` heisst „nicht gespeichert" — nicht „0" und
 * nicht „konnte nicht berechnet werden". Für Nutzerdokumente sind
 * `qualityScore` und `page` heute immer `null` (die Nutzlast in
 * DocumentSearchService/vectorOperations.ts:57 trägt sie nicht); genau dieser
 * Unterschied zu den Scraper-Sammlungen ist der Befund, den die Seite zeigt.
 */
import { z } from 'zod';

export const chunkInspectorErrorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const inspectedChunkSchema = z.object({
  index: z.number().int(),
  page: z.number().int().nullable(),
  text: z.string(),
  charCount: z.number().int(),
  tokenCount: z.number().int().nullable(),
  qualityScore: z.number().nullable(),
  /** Aus dem gespeicherten Text erkannt, nicht aus der Nutzlast gelesen. */
  hasTable: z.boolean(),
  embeddingPresent: z.boolean(),
  sparsePresent: z.boolean(),
});
export type InspectedChunk = z.infer<typeof inspectedChunkSchema>;

export const inspectedDocumentHeaderSchema = z.object({
  documentId: z.string(),
  /** Die angefragte Sammlungs-Kennung (System-ID oder Notebook-ID). */
  collection: z.string(),
  qdrantCollection: z.string(),
  isSystemCollection: z.boolean(),
  title: z.string().nullable(),
  filename: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sourceType: z.string().nullable(),
  /** documents.metadata->>'extractionMethod', sonst payload.extraction_method, sonst null. */
  extractionMethod: z.string().nullable(),
  extractionMethodOrigin: z.enum(['postgres_metadata', 'qdrant_payload', 'unknown']),
  pageCount: z.number().int().nullable(),
  chunkCount: z.number().int(),
  indexedAt: z.string().nullable(),
  /** Der Titel-Präfix, der vor dem Einbetten vor jeden Chunk gesetzt wurde. */
  embeddingTitlePrefix: z.string().nullable(),
  /** QUALITY_MIN_RETRIEVAL, oder null wenn der Qualitätsfilter aus ist. */
  qualityThreshold: z.number().nullable(),
});
export type InspectedDocumentHeader = z.infer<typeof inspectedDocumentHeaderSchema>;

export const inspectDocumentQuerySchema = z.object({
  collection: z.string().min(1),
  // URL-förmige Dokument-IDs (gescrapte Sammlungen) reisen im Query-String:
  // der Reverse-Proxy dekodiert %2F im Pfad und merged Slashes, bevor Express
  // routet; der Pfadparameter trägt dann den Platzhalter '-'.
  documentId: z.string().min(1).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const inspectDocumentResponseSchema = z.object({
  success: z.boolean(),
  header: inspectedDocumentHeaderSchema,
  chunks: z.array(inspectedChunkSchema),
  nextOffset: z.number().int().nullable(),
});
export type InspectDocumentResponse = z.infer<typeof inspectDocumentResponseSchema>;

export const inspectSearchQuerySchema = z.object({
  collection: z.string().min(1),
  // URL-förmige Dokument-IDs (gescrapte Sammlungen) reisen im Query-String:
  // der Reverse-Proxy dekodiert %2F im Pfad und merged Slashes, bevor Express
  // routet; der Pfadparameter trägt dann den Platzhalter '-'.
  documentId: z.string().min(1).optional(),
  query: z.string().min(2).max(500),
});

export const inspectSearchResponseSchema = z.object({
  success: z.boolean(),
  /** Nur Treffer AUS DIESEM Dokument, mit ihrem Ähnlichkeitswert. */
  hits: z.array(z.object({ index: z.number().int(), similarity: z.number() })),
  /** Treffer der Suche insgesamt — bei `scoped: false` grösser als `hits`. */
  totalResults: z.number().int(),
  /**
   * `true`: die Suche war per `getDocumentIdsFn` auf dieses Dokument
   * eingeschränkt. `false`: Systemsammlung — dort fragt der Abrufdienst
   * `getDocumentIdsFn` gar nicht (NotebookQAService.ts:685-708), die Suche lief
   * über die ganze Sammlung und `hits` ist der herausgefilterte Anteil.
   *
   * `scoped: true` heisst „per `getDocumentIdsFn` eingeschränkt", nicht „als
   * zu diesem Notebook zugehörig verifiziert" — der Filter engt die Suche ein,
   * er prüft keine Eigentümerschaft.
   */
  scoped: z.boolean(),
});
export type InspectSearchResponse = z.infer<typeof inspectSearchResponseSchema>;
