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
  'group_member_joined',
  'group_member_left',
  'group_role_changed',
  'group_content_shared',
  'group_deleted',
  'group_join_requested',
  'group_join_approved',
  'group_join_denied',
  'transfer_downloaded',
  'notebook_liked',
  'wolke_new_files',
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
  metadata: z.record(z.unknown()),
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

export const notificationPreferencesResponseSchema = z.object({
  success: z.boolean(),
  preferences: z.record(notifChannelPreferencesSchema),
  defaults: z.record(notifChannelPreferencesSchema),
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
