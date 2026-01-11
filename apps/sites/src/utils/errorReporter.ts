import { isErrorTrackingEnabled } from '../lib/errorTracking';

export function reportError(
  error: Error,
  context?: Record<string, unknown>
): void {
  console.error('Error reported:', error, context);
}

export function reportMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>
): void {
  const consoleMethod = level === 'warning' ? 'warn' : level;
  console[consoleMethod]('Message reported:', message, context);
}

export function setUserContext(user: {
  id: string;
  email?: string;
}): void {
  if (isErrorTrackingEnabled()) {
    console.info('User context set:', user.id);
  }
}

export function clearUserContext(): void {
  if (isErrorTrackingEnabled()) {
    console.info('User context cleared');
  }
}

export function addBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>
): void {
  if (isErrorTrackingEnabled()) {
    console.info('Breadcrumb:', { message, category, ...data });
  }
}
