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

// ── Teams (/me/joinedTeams, /teams/:id/channels, …/filesFolder) ──────────────

export const microsoftTeamSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  isArchived: z.boolean().nullable().optional(),
});
export type MicrosoftTeam = z.infer<typeof microsoftTeamSchema>;

export const graphTeamListResponseSchema = z.object({
  value: z.array(microsoftTeamSchema),
});

export const microsoftChannelSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  membershipType: z.string().nullable().optional(),
  isArchived: z.boolean().nullable().optional(),
});
export type MicrosoftChannel = z.infer<typeof microsoftChannelSchema>;

export const graphChannelListResponseSchema = z.object({
  value: z.array(microsoftChannelSchema),
});

export const graphFilesFolderSchema = z.object({
  id: z.string(),
  webUrl: z.string().nullable().optional(),
  parentReference: z.object({ driveId: z.string() }),
});
