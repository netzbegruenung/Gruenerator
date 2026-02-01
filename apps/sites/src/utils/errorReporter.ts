import * as Sentry from '@sentry/react';

import { isErrorTrackingEnabled } from '../lib/errorTracking';

export function reportError(error: Error, context?: Record<string, unknown>): void {
  console.error('Error reported:', error, context);
  if (isErrorTrackingEnabled()) {
    Sentry.captureException(error, { extra: context });
  }
}

export function reportMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>
): void {
  const consoleMethod = level === 'warning' ? 'warn' : level;
  console[consoleMethod]('Message reported:', message, context);
  if (isErrorTrackingEnabled()) {
    Sentry.captureMessage(message, { level, extra: context });
  }
}

export function setUserContext(user: { id: string; email?: string }): void {
  if (isErrorTrackingEnabled()) {
    Sentry.setUser({ id: user.id, email: user.email });
  }
}

export function clearUserContext(): void {
  if (isErrorTrackingEnabled()) {
    Sentry.setUser(null);
  }
}

export function addBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>
): void {
  if (isErrorTrackingEnabled()) {
    Sentry.addBreadcrumb({ message, category, data });
  }
}
