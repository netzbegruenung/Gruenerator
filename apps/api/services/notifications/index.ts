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

export { notifyGroupMembers, notifyGroupAdmins } from './groupNotifications.js';

// Kein `unsubscribeFromUserNotifications` mehr: abgemeldet wird über den
// Rückgabewert von `subscribeToUserNotifications`, weil eine Person mehrere
// Ströme gleichzeitig offen haben kann und die Nutzer-ID sie nicht auseinander
// hält.
export { subscribeToUserNotifications, publishNotification } from './notificationPubSub.js';

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
