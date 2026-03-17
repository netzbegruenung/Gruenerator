export type NotificationType =
  | 'document_shared'
  | 'document_edited'
  | 'board_updates'
  | 'group_activity';

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
