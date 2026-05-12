export {
  sendEmail,
  sendDocumentShareEmail,
  sendContentDeliveryEmail,
  sendNotificationEmail,
  verifyEmailConnection,
  isEmailConfigured,
  type SendEmailOptions,
  type DocumentShareEmailParams,
  type ContentDeliveryEmailParams,
  type NotificationEmailParams,
} from './emailService.js';

export { shouldSendNotification } from './notificationPreferences.js';
