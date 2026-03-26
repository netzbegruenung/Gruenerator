// Re-export from the canonical notification preferences module for backward compatibility.
// New code should import from 'services/notifications/notificationPreferences.js' directly.
export { shouldSendNotification } from '../notifications/notificationPreferences.js';
