// src/utils/errorHandling.js

class AppError extends Error {
    constructor(message, type, originalError = null) {
      super(message);
      this.name = this.constructor.name;
      this.type = type;
      this.originalError = originalError;
    }
  }
  
  export const ErrorTypes = {
    NETWORK: 'NETWORK',
    API: 'API',
    VALIDATION: 'VALIDATION',
    UNEXPECTED: 'UNEXPECTED'
  };
  
  export function handleError(error, setError) {
    let appError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error.isAxiosError) {
      appError = new AppError(
        'Ein Netzwerkfehler ist aufgetreten.',
        ErrorTypes.NETWORK,
        error
      );
    } else {
      appError = new AppError(
        'Ein unerwarteter Fehler ist aufgetreten.',
        ErrorTypes.UNEXPECTED,
        error
      );
    }
  
    console.error('Error:', appError);
    setError(appError.message);
  
    // Hier können Sie zusätzliche Aktionen durchführen, z.B. Fehler-Logging
  }
  
  export { AppError };