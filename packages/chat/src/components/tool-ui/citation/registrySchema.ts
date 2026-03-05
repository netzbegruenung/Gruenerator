import { z } from 'zod';

export const SerializableCitationSchema = z.object({
  id: z.string(),
  href: z.string(),
  title: z.string(),
  snippet: z.string().optional(),
  domain: z.string().optional(),
  favicon: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  type: z.enum(['webpage', 'document', 'article', 'api', 'code', 'other']).default('webpage'),
});

export type SerializableCitation = z.infer<typeof SerializableCitationSchema>;

export function safeParseSerializableRegistryCitation(data: unknown): SerializableCitation | null {
  const result = SerializableCitationSchema.safeParse(data);
  return result.success ? result.data : null;
}
