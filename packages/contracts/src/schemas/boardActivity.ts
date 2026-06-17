/**
 * Zod schemas for the per-card activity log (board cards).
 *
 * Most card mutations happen client-side via Yjs, so the client POSTs a semantic
 * activity event after a mutation; server-originated events (comment/attachment
 * added) are recorded in-process. The activity feed is merged into the comments
 * timeline on the client (kan-style unified feed).
 */
import { z } from 'zod';

export const activityTypeSchema = z.enum([
  'card_created',
  'card_moved',
  'assignees_changed',
  'labels_changed',
  'due_changed',
  'card_archived',
  'card_restored',
  'comment_added',
  'attachment_added',
  // Board-level events (recorded with a null card_id) — they surface in the
  // board-wide activity feed (A8) and notify board watchers (A9).
  'board_renamed',
  'board_archived',
  'board_restored',
  'board_duplicated',
]);
export type ActivityType = z.infer<typeof activityTypeSchema>;

/** Free-form, type-specific detail (e.g. { from, to } for a move). */
export const activityPayloadSchema = z.record(z.unknown());

/**
 * Typed view of the `assignees_changed` payload. The generic `activityPayloadSchema`
 * stays the transport; the router `safeParse`s this when `type === 'assignees_changed'`
 * and the client builds the payload from `AssigneesChangedPayload` — so the assignment
 * delegation fields are validated and strongly typed end-to-end (no loose record reads).
 *
 * `addedAssigneeIds` is `uuid[]` because it is cast to `::uuid[]` server-side and used
 * for user notifications — agent identifier slugs must NEVER appear here. A delegated
 * agent rides in `delegateAgentId` (an identifier slug, open set → plain string).
 */
export const assigneesChangedPayloadSchema = z.object({
  addedAssigneeIds: z.array(z.string().uuid()).optional(),
  cardTitle: z.string().nullish(),
  cardDescription: z.string().nullish(),
  delegateAgentId: z.string().nullish(),
});
export type AssigneesChangedPayload = z.infer<typeof assigneesChangedPayloadSchema>;

export const boardActivityRowSchema = z.object({
  id: z.string(),
  board_id: z.string(),
  // null for board-level events (A8).
  card_id: z.string().nullable(),
  user_id: z.string(),
  type: activityTypeSchema,
  payload: activityPayloadSchema,
  created_at: z.string(),
  author_name: z.string().nullable(),
  author_avatar_robot_id: z.number().nullable(),
});
export type BoardActivityEntry = z.infer<typeof boardActivityRowSchema>;

export const recordActivityBodySchema = z.object({
  type: activityTypeSchema,
  payload: activityPayloadSchema.optional(),
});

export const activityListResponseSchema = z.array(boardActivityRowSchema);
export const activitySuccessResponseSchema = z.object({ success: z.literal(true) });
export const boardActivityErrorResponseSchema = z.object({ error: z.string() });
