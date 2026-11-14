/**
 * Zod schemas for notifications endpoints.
 * Mirrors apps/api/routes/notifications/index.ts.
 *
 * NOTE: The /stream SSE endpoint is NOT contracted — it uses
 * text/event-stream which ts-rest cannot model. It stays on the legacy router.
 */
import { z } from 'zod';

// ── Enums (single source of truth for client + server) ───────────────────────

/**
 * All notification types the platform can emit. Kept in sync with the
 * `notifications.type` text column in Postgres and the dispatcher in
 * apps/api/services/notifications/NotificationService.ts.
 *
 * Adding a new type: add it here, then update
 * apps/api/services/notifications/notificationPreferences.ts
 * (DEFAULT_CHANNEL_PREFERENCES) and the frontend notificationConfig.
 */
export const notificationTypeSchema = z.enum([
  'document_shared',
  'document_permission_changed',
  'document_access_revoked',
  'board_updates',
  'board_comment_added',
  'board_comment_reply',
  'board_user_mentioned',
  'board_card_assigned',
  'board_card_status_changed',
  'board_attachment_added',
  'board_due_date_reminder',
  'board_card_watching',
  'group_member_joined',
  'group_member_left',
  'group_role_changed',
  'group_content_shared',
  'group_comment_added',
  'group_post_created',
  'group_user_mentioned',
  'group_mention_all',
  'group_deleted',
  'group_join_requested',
  'group_join_approved',
  'group_join_denied',
  'transfer_downloaded',
  'notebook_liked',
  'template_liked',
  'wolke_new_files',
  'agent_task_completed',
  'agent_task_failed',
  'agent_task_awaiting_review',
  'new_avatars',
  'template_approved',
  'template_rejected',
  'daily_briefing',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationChannelSchema = z.enum(['email', 'push', 'in_app']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

// ── Sub-schemas ──────────────────────────────────────────────────────────────

export const notificationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  action_url: z.string().nullable(),
  group_key: z.string().nullable(),
  is_read: z.boolean(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const notifChannelPreferencesSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  in_app: z.boolean(),
});
export type NotifChannelPreferences = z.infer<typeof notifChannelPreferencesSchema>;

/**
 * Simplified notification level. 'low' | 'medium' | 'high' are the three user
 * presets (Wenig/Mittel/Viele); 'custom' is derived when the resolved
 * preferences match no preset (the user fine-tuned channels in expert mode).
 */
export const notificationLevelSchema = z.enum(['low', 'medium', 'high', 'custom']);
export type NotificationLevel = z.infer<typeof notificationLevelSchema>;

export const notificationPreferencesResponseSchema = z.object({
  success: z.boolean(),
  level: notificationLevelSchema,
  preferences: z.record(z.string(), notifChannelPreferencesSchema),
  defaults: z.record(z.string(), notifChannelPreferencesSchema),
});

// ── Request bodies ───────────────────────────────────────────────────────────

export const updateNotificationPreferencesBodySchema = z.object({
  category: z.string(),
  channels: z.object({
    email: z.boolean().nullish(),
    push: z.boolean().nullish(),
    in_app: z.boolean().nullish(),
  }),
});

export const setNotificationLevelBodySchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
});

// ── Response schemas ─────────────────────────────────────────────────────────

export const notificationsListResponseSchema = z.array(notificationSchema);

export const unreadCountResponseSchema = z.object({
  count: z.number(),
});

export const notificationSuccessResponseSchema = z.object({
  success: z.boolean(),
});

export const notificationsErrorResponseSchema = z.object({
  error: z.string(),
});

// ── Push (App) ───────────────────────────────────────────────────────────────

/**
 * Which notification types may go out as an app push, grouped the way the app
 * shows its switches. A type missing here never pushes, whatever the stored
 * preference says. `priority` maps to APNs 10/5 and FCM HIGH/NORMAL: `normal`
 * lets the OS batch delivery to save battery and data.
 */
export const PUSH_NOTIFICATION_GROUPS = [
  {
    id: 'personal',
    label: 'Persönlich an Dich',
    priority: 'high',
    types: [
      'group_user_mentioned',
      'board_user_mentioned',
      'board_comment_reply',
      'board_card_assigned',
      'document_shared',
      'group_join_approved',
    ],
  },
  {
    id: 'tasks',
    label: 'Aufgaben von Agents',
    priority: 'high',
    types: ['agent_task_completed', 'agent_task_failed', 'agent_task_awaiting_review'],
  },
  {
    id: 'deadlines',
    label: 'Fristen',
    priority: 'high',
    types: ['board_due_date_reminder'],
  },
  {
    id: 'activity',
    label: 'Aktivität in Projekten',
    priority: 'normal',
    types: [
      'group_post_created',
      'group_comment_added',
      'group_content_shared',
      'group_join_requested',
      'group_mention_all',
      'board_comment_added',
    ],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  priority: 'high' | 'normal';
  types: readonly NotificationType[];
}[];

export type PushGroupId = (typeof PUSH_NOTIFICATION_GROUPS)[number]['id'];
export type PushPriority = (typeof PUSH_NOTIFICATION_GROUPS)[number]['priority'];

const PUSH_PRIORITY_BY_TYPE: ReadonlyMap<NotificationType, PushPriority> = new Map(
  PUSH_NOTIFICATION_GROUPS.flatMap((g) => g.types.map((t) => [t, g.priority] as const))
);

/** Push priority of a type, or null when the type never pushes. */
export function pushPriorityOf(type: NotificationType): PushPriority | null {
  return PUSH_PRIORITY_BY_TYPE.get(type) ?? null;
}
