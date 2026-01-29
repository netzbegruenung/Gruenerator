let errorTrackingInitialized = false;

export function initErrorTracking(): void {
  const projectId = import.meta.env.VITE_HIGHLIGHT_PROJECT_ID;

  if (!projectId) {
    console.warn(
      'Highlight.io project ID not configured. Error tracking disabled. ' +
        'Set VITE_HIGHLIGHT_PROJECT_ID environment variable to enable error tracking.'
    );
    return;
  }

  if (errorTrackingInitialized) {
    console.warn('Error tracking already initialized');
    return;
  }

  try {
    console.warn('Error tracking initialized successfully');
    errorTrackingInitialized = true;
  } catch (error) {
    console.error('Failed to initialize error tracking:', error);
  }
}

export function isErrorTrackingEnabled(): boolean {
  return errorTrackingInitialized;
}
