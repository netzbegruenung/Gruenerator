import * as Sentry from '@sentry/react';

let errorTrackingInitialized = false;

export function initErrorTracking(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.info(
      'Sentry DSN not configured. Error tracking disabled. ' +
        'Set VITE_SENTRY_DSN environment variable to enable error tracking.'
    );
    return;
  }

  if (errorTrackingInitialized) {
    console.warn('Error tracking already initialized');
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      enabled: import.meta.env.PROD,
      tracesSampleRate: 0,
    });
    console.info('Error tracking initialized successfully');
    errorTrackingInitialized = true;
  } catch (error) {
    console.error('Failed to initialize error tracking:', error);
  }
}

export function isErrorTrackingEnabled(): boolean {
  return errorTrackingInitialized;
}
