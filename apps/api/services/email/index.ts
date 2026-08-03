export {
  sendEmail,
  sendDocumentShareEmail,
  sendBoardNotificationEmail,
  sendDocumentNotificationEmail,
  sendContentDeliveryEmail,
  sendNotificationEmail,
  sendGroupInviteEmail,
  verifyEmailConnection,
  isEmailConfigured,
  type SendEmailOptions,
  type DocumentShareEmailParams,
  type BoardNotificationEmailParams,
  type DocumentNotificationEmailParams,
  type ContentDeliveryEmailParams,
  type NotificationEmailParams,
  type GroupInviteEmailParams,
} from './emailService.js';

export { shouldSendNotification } from './notificationPreferences.js';
