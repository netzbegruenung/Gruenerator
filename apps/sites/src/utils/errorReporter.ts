import { isErrorTrackingEnabled } from '../lib/errorTracking';

export function reportError(error: Error, context?: Record<string, unknown>): void {
  console.error('Error reported:', error, context);
}

export function reportMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>
): void {
  if (level === 'error') {
    console.error('Message reported:', message, context);
  } else {
    console.warn('Message reported:', message, context);
  }
}

export function setUserContext(user: { id: string; email?: string }): void {
  if (isErrorTrackingEnabled()) {
    console.warn('User context set:', user.id);
  }
}

export function clearUserContext(): void {
  if (isErrorTrackingEnabled()) {
    console.warn('User context cleared');
  }
}

export function addBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>
): void {
  if (isErrorTrackingEnabled()) {
    console.warn('Breadcrumb:', { message, category, ...data });
  }
}
