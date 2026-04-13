/**
 * Zod schemas for notifications endpoints.
 * Mirrors apps/api/routes/notifications/index.ts.
 *
 * NOTE: The /stream SSE endpoint is NOT contracted — it uses
 * text/event-stream which ts-rest cannot model. It stays on the legacy router.
 */
import { z } from 'zod';

// ── Sub-schemas ──────────────────────────────────────────────────────────────

export const notificationSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  metadata: z.record(z.unknown()),
  action_url: z.string().nullable(),
  group_key: z.string().nullable(),
  is_read: z.boolean(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export const notifChannelPreferencesSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  in_app: z.boolean(),
});

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
