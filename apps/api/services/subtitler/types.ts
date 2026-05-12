/**
 * Subtitler Service Types
 *
 * The DB row shape (`SubtitlerProject`) is derived from the Drizzle schema
 * via `InferSelectModel` — no hand-written interface drifts from the table
 * definition. Update / list shapes come from the ts-rest contract in
 * `@gruenerator/contracts`, so the wire format and the service signature
 * stay in lock-step.
 *
 * Pre-unification (2026-04-13) this file held five hand-written interfaces
 * that drifted from the schema and the Zod contract; in particular the
 * `subtitles: string` field disagreed with the canonical `SubtitleSegment[]`
 * wire shape and the controllers compensated with `as Parameters<...>` casts.
 */

import { type InferSelectModel } from 'drizzle-orm';

import { subtitlerProjects } from '../../database/schema/index.js';

import type { UpdateProjectBody } from '@gruenerator/contracts';

/**
 * Postgres row shape for `subtitler_projects`, derived directly from the
 * Drizzle schema. The `status` enum is widened to `string` by `text()` —
 * narrowed here for service-layer use.
 */
export type SubtitlerProjectRow = InferSelectModel<typeof subtitlerProjects>;

export interface SubtitlerProject extends Omit<SubtitlerProjectRow, 'user_id' | 'status' | 'subtitles'> {
  user_id: string;
  status: 'saved' | 'exported' | 'processing';
  subtitles: string;
}

/**
 * Project list item — the subset returned by `getUserProjects()`. Field
 * names mirror the Drizzle select projection (no subtitles blob, no
 * video_path, no user_id, no style_settings); `status` stays wide
 * (`string`) because the projection drops Drizzle's text() to plain string.
 */
export type SubtitlerProjectListItem = Omit<
  SubtitlerProjectRow,
  'subtitles' | 'video_path' | 'user_id' | 'style_settings'
>;

/**
 * Service-internal create payload. Distinct from the wire contract because
 * the service expects `subtitles` to be the pre-stringified JSON blob
 * (the wire takes `SubtitleSegment[]`; `projectSavingService` does the
 * `JSON.stringify` at the boundary).
 */
export interface CreateProjectData {
  uploadId: string;
  subtitles?: string | undefined;
  title?: string | undefined;
  stylePreference?: string | null | undefined;
  heightPreference?: string | null | undefined;
  modePreference?: string | null | undefined;
  videoMetadata?: Record<string, unknown> | undefined;
  videoFilename?: string | undefined;
  videoSize?: number | undefined;
  videoSourcePath?: string | undefined;
}

/**
 * Update payload — derived directly from the wire contract so any
 * `validateBody`-typed request body flows in without a cast.
 */
export type UpdateProjectData = UpdateProjectBody;

export interface DeleteProjectResult {
  success: boolean;
}
