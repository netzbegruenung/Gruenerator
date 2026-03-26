export {
  createNotification,
  getNotificationsForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  dismissAllNotifications,
  deleteOldNotifications,
} from './NotificationService.js';

export { notifyGroupMembers } from './groupNotifications.js';

export {
  subscribeToUserNotifications,
  unsubscribeFromUserNotifications,
  publishNotification,
} from './notificationPubSub.js';

export {
  shouldDeliver,
  shouldSendNotification,
  getPreferencesForUser,
  getDefaultPreferences,
} from './notificationPreferences.js';

export type {
  Notification,
  NotificationType,
  NotificationChannel,
  ChannelPreferences,
  CreateNotificationParams,
  NotificationListOptions,
} from './types.js';
