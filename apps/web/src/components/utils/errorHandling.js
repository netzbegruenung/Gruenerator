import { getErrorMessage } from './errorMessages';

// Zentrale Fehlerbehandlungsfunktion
export const handleError = (error, setError) => {
  console.group('[handleError]');
  console.error('Original error:', error);
  console.log('SetError function provided:', !!setError);
  
  const errorInfo = getErrorMessage(error);
  console.log('Processed errorInfo:', errorInfo);
  
  const finalError = {
    title: errorInfo.title,
    message: errorInfo.message,
    details: errorInfo.details || error.message,
    status: error.response?.status,
    requestId: error.response?.headers?.['request-id']
  };
  
  console.log('Final error object:', finalError);
  setError(finalError);
  console.groupEnd();
};

export const resetError = (setError) => {
  setError(null);
};