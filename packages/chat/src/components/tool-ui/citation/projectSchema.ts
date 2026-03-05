import { z } from 'zod';

/**
 * Project-specific citation schema used by the custom Citation.tsx component
 * (SearchResultsSection, CitationPopover). Distinct from the registry's
 * SerializableCitationSchema which powers CitationList / ToolCallUI.
 */
export const citationSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  citedText: z.string().optional(),
  source: z.string(),
  collectionName: z.string().optional(),
  domain: z.string().optional(),
  relevance: z.number().optional(),
  contentType: z.string().optional(),
  documentId: z.string().optional(),
  chunkIndex: z.number().optional(),
  similarityScore: z.number().optional(),
  collectionId: z.string().optional(),
});

export type CitationProps = z.infer<typeof citationSchema>;
