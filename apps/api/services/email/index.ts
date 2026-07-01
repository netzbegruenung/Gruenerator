export {
  sendEmail,
  sendDocumentShareEmail,
  sendBoardNotificationEmail,
  sendDocumentNotificationEmail,
  sendContentDeliveryEmail,
  sendNotificationEmail,
  verifyEmailConnection,
  isEmailConfigured,
  type SendEmailOptions,
  type DocumentShareEmailParams,
  type BoardNotificationEmailParams,
  type DocumentNotificationEmailParams,
  type ContentDeliveryEmailParams,
  type NotificationEmailParams,
} from './emailService.js';

export { shouldSendNotification } from './notificationPreferences.js';
