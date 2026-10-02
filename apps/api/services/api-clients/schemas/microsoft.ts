import { z } from 'zod';

// ── Drive item (/me/drive/items/:id) ─────────────────────────────────────────

export const microsoftDriveItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  lastModifiedDateTime: z.string(),
  webUrl: z.string().nullable().optional(),
  file: z
    .object({
      mimeType: z.string(),
    })
    .optional(),
  folder: z
    .object({
      childCount: z.number(),
    })
    .optional(),
});

export type MicrosoftDriveItem = z.infer<typeof microsoftDriveItemSchema>;

// ── List response wrapper (Graph uses { value: T[], @odata.nextLink?: string })

export const graphDriveItemListResponseSchema = z.object({
  value: z.array(microsoftDriveItemSchema),
  '@odata.nextLink': z.string().optional(),
});

export type GraphDriveItemListResponse = z.infer<typeof graphDriveItemListResponseSchema>;
