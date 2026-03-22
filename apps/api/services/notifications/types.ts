// Display properties (icons, labels, images) are configured in the frontend:
// apps/web/src/features/notifications/notificationConfig.ts
export type NotificationType =
  | 'document_shared'
  | 'document_permission_changed'
  | 'document_access_revoked'
  | 'board_updates'
  | 'group_activity'
  | 'group_member_joined'
  | 'group_role_changed'
  | 'group_content_shared'
  | 'group_deleted'
  | 'wolke_setup';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  action_url: string | null;
  group_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
  groupKey?: string;
}

export interface NotificationListOptions {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}
