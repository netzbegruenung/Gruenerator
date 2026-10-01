/**
 * Zod-Schemata der admin-gesicherten Konnektor-Testseite. Spiegelt
 * apps/api/routes/admin/connectorTestContractRouter.ts.
 *
 * Die Seite prüft die Nango-Konten von Google und Microsoft vor der Freigabe
 * für alle: verbinden, Token prüfen, eine Datei über denselben Abruf lesen, den
 * `@connect` im Chat fährt.
 */
import { z } from 'zod';

export const connectorTestProviderSchema = z.enum(['google', 'microsoft']);
export type ConnectorTestProvider = z.infer<typeof connectorTestProviderSchema>;

export const connectorTestErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

export const connectorTestProviderParamsSchema = z.object({
  provider: connectorTestProviderSchema,
});

export const connectorTestStatusResponseSchema = z.object({
  success: z.literal(true),
  nangoConfigured: z.boolean(),
  pickerConfigured: z.boolean(),
  providers: z.array(
    z.object({
      provider: connectorTestProviderSchema,
      label: z.string(),
      connected: z.boolean(),
      connectedAt: z.string().nullable(),
    })
  ),
});
export type ConnectorTestStatusResponse = z.infer<typeof connectorTestStatusResponseSchema>;

export const connectorTestConnectResponseSchema = z.object({
  success: z.literal(true),
  connectLink: z.string(),
});

export const connectorTestFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  isFolder: z.boolean(),
});
export type ConnectorTestFile = z.infer<typeof connectorTestFileSchema>;

export const connectorTestProbeBodySchema = z.object({
  folderId: z.string().min(1).nullish(),
});

/** `ok: false` ist ein Befund, kein Fehler der Route — deshalb 200. */
export const connectorTestProbeResponseSchema = z.object({
  success: z.literal(true),
  ok: z.boolean(),
  error: z.string().nullable(),
  files: z.array(connectorTestFileSchema),
});
export type ConnectorTestProbeResponse = z.infer<typeof connectorTestProbeResponseSchema>;

export const connectorTestPickerResponseSchema = z.object({
  success: z.literal(true),
  accessToken: z.string(),
  apiKey: z.string(),
  appId: z.string(),
});
export type ConnectorTestPickerResponse = z.infer<typeof connectorTestPickerResponseSchema>;

export const connectorTestReadBodySchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().nullish(),
});

export const connectorTestReadResponseSchema = z.object({
  success: z.literal(true),
  ok: z.boolean(),
  error: z.string().nullable(),
  reauth: z.boolean(),
  chunkCount: z.number().int(),
  preview: z.string(),
});
export type ConnectorTestReadResponse = z.infer<typeof connectorTestReadResponseSchema>;

export const connectorTestDisconnectResponseSchema = z.object({
  success: z.literal(true),
});
