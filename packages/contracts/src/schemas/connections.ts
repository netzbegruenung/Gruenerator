/**
 * Zod-Schemata der Ordneransicht verbundener Konten (OneDrive, Google Drive).
 * Spiegelt apps/api/routes/connections/connectionsContractRouter.ts.
 *
 * Eine Antwortform für beide Anbieter: der Dateibrowser im Chat kennt nur
 * `DriveEntry`, nicht die Rohformen von Graph und Drive.
 */
import { z } from 'zod';

export const driveProviderSchema = z.enum(['google', 'microsoft']);
export type DriveProvider = z.infer<typeof driveProviderSchema>;

export const driveBrowseParamsSchema = z.object({
  provider: driveProviderSchema,
});

export const driveBrowseQuerySchema = z.object({
  /** Ohne Angabe: die oberste Ebene des eigenen Laufwerks. */
  folderId: z.string().min(1).optional(),
});

export const driveEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  isFolder: z.boolean(),
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  /** Kann der Chat-Abruf daraus Text machen? Ordner: immer false. */
  isSupported: z.boolean(),
});
export type DriveEntry = z.infer<typeof driveEntrySchema>;

export const driveBrowseResponseSchema = z.object({
  success: z.literal(true),
  entries: z.array(driveEntrySchema),
  /** Der Ordner hat mehr Einträge, als die Liste trägt. */
  truncated: z.boolean(),
});
export type DriveBrowseResponse = z.infer<typeof driveBrowseResponseSchema>;

/** Nango-Link, der genau diesen Anbieter verbindet (öffnet im Popup). */
export const driveConnectLinkResponseSchema = z.object({
  success: z.literal(true),
  connectLink: z.string(),
});

/**
 * Was der Google Picker im Browser braucht. Unter dem Scope `drive.file` sieht
 * der Grünerator nur Dateien, die die Person im Picker ausgewählt hat; Token,
 * API-Key und App-ID müssen aus demselben Cloud-Projekt stammen wie der
 * OAuth-Client. Der Token gehört der angemeldeten Person.
 */
export const googlePickerConfigResponseSchema = z.object({
  success: z.literal(true),
  accessToken: z.string(),
  apiKey: z.string(),
  appId: z.string(),
});
export type GooglePickerConfig = z.infer<typeof googlePickerConfigResponseSchema>;

export const driveBrowseErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  /** Das Konto muss neu verbunden werden (Token abgelaufen oder widerrufen). */
  reauth: z.boolean(),
});
