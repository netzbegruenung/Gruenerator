/**
 * Zod-Schemata der Ordneransicht verbundener Konten (OneDrive, Google Drive).
 * Spiegelt apps/api/routes/connections/connectionsContractRouter.ts.
 *
 * Eine Antwortform für beide Anbieter: der Dateibrowser im Chat kennt nur
 * `DriveEntry`, nicht die Rohformen von Graph und Drive.
 */
import { z } from 'zod';

/**
 * Anbieter mit Ordneransicht und Dateien als Chat-Material. `microsoft-teams`
 * zeigt Team → Kanal → Dateiordner; die Kennungen dort kodiert der Server
 * (`services/connections/teamsIds.ts`), der Client reicht sie nur durch.
 */
export const driveProviderSchema = z.enum(['google', 'microsoft', 'microsoft-teams']);
export type DriveProvider = z.infer<typeof driveProviderSchema>;

/** Laufwerke, in die ein Export ohne Zielwahl geht (eigene Ablage). */
export const cloudExportProviderSchema = z.enum(['google', 'microsoft']);
export type CloudExportProvider = z.infer<typeof cloudExportProviderSchema>;

/**
 * Anbieter, bei denen ein Export ein Ziel braucht: ein Teams-Kanal, ein
 * Slack-Kanal, eine Trello-Liste. Gewählt wird über `targets`, geschickt über `send`.
 */
export const connectorTargetProviderSchema = z.enum(['microsoft-teams', 'slack', 'trello']);
export type ConnectorTargetProvider = z.infer<typeof connectorTargetProviderSchema>;

/** Jeder Nango-Konnektor mit Karte im Verzeichnis. */
export const connectorProviderSchema = z.enum([
  'google',
  'microsoft',
  'microsoft-teams',
  'slack',
  'trello',
]);
export type ConnectorProvider = z.infer<typeof connectorProviderSchema>;

export const driveBrowseParamsSchema = z.object({
  provider: driveProviderSchema,
});

export const connectorProviderParamsSchema = z.object({
  provider: connectorProviderSchema,
});

export const cloudExportParamsSchema = z.object({
  provider: cloudExportProviderSchema,
});

export const connectorTargetParamsSchema = z.object({
  provider: connectorTargetProviderSchema,
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

/**
 * Export in ein verbundenes Laufwerk: der Client schickt eine fertige Datei
 * (Word aus dem Chat oder aus Docs) als Multipart-Teil `CLOUD_UPLOAD_FIELD`.
 * Google legt daraus ein Google-Doc an, OneDrive eine .docx im Ordner
 * „Grünerator“. Die Datei steht in `req.file`, nicht im Body-Schema.
 */
export const CLOUD_UPLOAD_FIELD = 'file';
export const CLOUD_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export const driveUploadBodySchema = z.object({});

export const driveUploadResponseSchema = z.object({
  success: z.literal(true),
  /** Name der angelegten Datei, wie der Anbieter ihn vergeben hat. */
  name: z.string(),
  /** Link, der die Datei beim Anbieter öffnet. */
  webUrl: z.string().url(),
});
export type DriveUploadResponse = z.infer<typeof driveUploadResponseSchema>;

/**
 * Eine Ebene der Zielwahl: Teams → Kanäle, Slack → Kanäle, Trello → Boards →
 * Listen. `selectable` heisst: hier kann der Export landen.
 */
export const connectorTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  hasChildren: z.boolean(),
  selectable: z.boolean(),
});
export type ConnectorTarget = z.infer<typeof connectorTargetSchema>;

export const connectorTargetsQuerySchema = z.object({
  /** Ohne Angabe: die oberste Ebene (Teams, Slack-Kanäle, Trello-Boards). */
  parent: z.string().min(1).optional(),
});

export const connectorTargetsResponseSchema = z.object({
  success: z.literal(true),
  entries: z.array(connectorTargetSchema),
});

/**
 * Export an ein gewähltes Ziel, als Multipart: Teams bekommt die Word-Datei im
 * Teil `CLOUD_UPLOAD_FIELD`, Slack und Trello den Text als Markdown.
 */
export const CONNECTOR_SEND_TEXT_MAX = 40_000;

export const connectorSendBodySchema = z.object({
  targetId: z.string().min(1),
  title: z.string().min(1).max(200),
  text: z.string().max(CONNECTOR_SEND_TEXT_MAX).optional(),
});
export type ConnectorSendBody = z.infer<typeof connectorSendBodySchema>;

export const connectorSendResponseSchema = driveUploadResponseSchema;
export type ConnectorSendResponse = z.infer<typeof connectorSendResponseSchema>;
