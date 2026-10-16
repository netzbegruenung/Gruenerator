/**
 * Zod schemas for the docs version history (/api/docs/:id/snapshots).
 *
 * Snapshot content travels as the raw Yjs state, base64-encoded — the format
 * BlockNote's Yjs 13 versioning reads (`VersionStorage<Uint8Array>`).
 *
 * Request bodies use `.nullish()` for optional fields: the frontend sends
 * `null` for unset values (see schemas/docs.ts).
 */
import { z } from 'zod';

import { docsErrorSchema } from './docs.js';

/** Names are free text; the cap keeps a pasted paragraph out of the list. */
export const SNAPSHOT_LABEL_MAX = 200;

export const snapshotLabelSchema = z.string().trim().max(SNAPSHOT_LABEL_MAX);

export const docSnapshotSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  created_at: z.string(),
  is_auto_save: z.boolean(),
  label: z.string().nullable(),
  created_by: z.string().nullable(),
  created_by_name: z.string().nullable(),
  /** Auto-saves within 30 minutes are grouped into the newest one; 1 when ungrouped. */
  snapshot_count: z.number().int(),
});

export const listDocSnapshotsQuerySchema = z.object({
  grouped: z.enum(['true', 'false']).optional(),
});

export const docSnapshotListSchema = z.object({ snapshots: z.array(docSnapshotSchema) });

export const createDocSnapshotBodySchema = z
  .object({ label: snapshotLabelSchema.nullish() })
  .nullish();

export const createdDocSnapshotSchema = z.object({
  version: z.number().int(),
  created_at: z.string(),
});

export const docSnapshotContentSchema = z.object({
  version: z.number().int(),
  /** Full Yjs state of the version, base64. */
  update: z.string(),
});

/** Read by web tabs loaded before the BlockNote history replaced the HTML preview. */
export const docSnapshotPreviewSchema = z.object({
  version: z.number().int(),
  html: z.string(),
  created_at: z.string(),
});

export const renameDocSnapshotBodySchema = z.object({ label: snapshotLabelSchema.nullable() });

/**
 * `live`: the server applies the version to the live document. Absent: tabs
 * from before that change, which apply the version themselves; the server
 * then only saves the current content first.
 */
export const restoreDocSnapshotModeSchema = z.enum(['live']);

export const restoreDocSnapshotBodySchema = z
  .object({ apply: restoreDocSnapshotModeSchema.nullish() })
  .nullish();

export const restoredDocSnapshotSchema = z.object({
  success: z.literal(true),
  new_version: z.number().int().optional(),
  message: z.string().optional(),
});

export const docSnapshotSuccessSchema = z.object({ success: z.literal(true) });

export const docSnapshotErrorSchema = docsErrorSchema;

export type DocSnapshot = z.infer<typeof docSnapshotSchema>;
export type RestoreDocSnapshotMode = z.infer<typeof restoreDocSnapshotModeSchema>;
