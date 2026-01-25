import { getErrorMessage } from './errorMessages';

import type { AxiosError } from 'axios';

/**
 * Error state structure used throughout the application
 */
export interface ErrorState {
  title: string;
  message: string;
  details?: string;
  status?: number;
  requestId?: string;
}

/**
 * Error setter function type
 */
export type SetErrorFn = (error: ErrorState | null) => void;

/**
 * Central error handling function
 */
export const handleError = (error: unknown, setError: SetErrorFn): void => {
  console.group('[handleError]');
  console.error('Original error:', error);
  console.log('SetError function provided:', !!setError);

  const errorInfo = getErrorMessage(error);
  console.log('Processed errorInfo:', errorInfo);

  const axiosError = error as AxiosError;

  const finalError: ErrorState = {
    title: errorInfo.title,
    message: errorInfo.message,
    details: errorInfo.details || (error as Error)?.message,
    status: axiosError?.response?.status,
    requestId: axiosError?.response?.headers?.['request-id'] as string | undefined,
  };

  console.log('Final error object:', finalError);
  setError(finalError);
  console.groupEnd();
};

/**
 * Reset error state
 */
export const resetError = (setError: SetErrorFn): void => {
  setError(null);
};
