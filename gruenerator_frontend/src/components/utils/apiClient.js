import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://gruenerator.de/api';

const apiClient = axios.create({
  baseURL: baseURL,
  timeout: 900000,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

async function retryWithExponentialBackoff(operation, retryCount = 0, onRetry) {
  try {
    return await operation();
  } catch (error) {
    if ((error.response?.status === 529 || error.response?.status === 503) && retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, retryCount);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;
      
      if (onRetry) {
        onRetry(retryCount + 1, totalDelay);
      }
      
      await new Promise(resolve => setTimeout(resolve, totalDelay));
      return retryWithExponentialBackoff(operation, retryCount + 1, onRetry);
    }
    throw error;
  }
}

export const uploadFileAndGetText = async (endpoint, file) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const uploadResponse = await apiClient.post(`${endpoint}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return uploadResponse.data.text;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const processText = async (endpoint, formData) => {
  try {
    console.log('[apiClient] Sending request with backup:', formData.useBackupProvider, {
      endpoint,
      useBackupProvider: formData.useBackupProvider,
      hasSystemPrompt: !!formData.systemPrompt,
      type: formData.type
    });

    const { onRetry, ...cleanFormData } = formData;

    const response = await retryWithExponentialBackoff(
      () => apiClient.post(endpoint, cleanFormData),
      0,
      onRetry
    );

    // Detaillierteres Logging
    const responseData = response.data;
    console.log('[apiClient] Raw Response:', responseData);
    console.log('[apiClient] Response Details:', {
      provider: responseData.metadata?.provider,
      backupRequested: responseData.metadata?.backupRequested,
      hasContent: !!responseData.content,
      timestamp: responseData.metadata?.timestamp
    });

    return responseData;
  } catch (error) {
    console.error('[apiClient] Error processing request:', error);
    handleApiError(error);
    throw error;
  }
};

const handleApiError = (error) => {
  if (error.response) {
    // Strukturierte Fehlerinformationen aus dem Backend extrahieren
    const errorData = error.response.data;
    
    // Detailliertes Logging des Fehlers
    console.error('API Error:', {
      status: error.response.status,
      data: errorData,
      url: error.config?.url,
      method: error.config?.method
    });
    
    // Prüfe auf die neue strukturierte Fehlerantwort
    if (error.response.status === 500 && typeof errorData === 'object') {
      // Erstelle einen benutzerfreundlichen Fehler mit den Informationen aus dem Backend
      const friendlyError = new Error(errorData.message || 'Ein Serverfehler ist aufgetreten');
      friendlyError.name = 'ServerError';
      friendlyError.originalError = error;
      friendlyError.errorId = errorData.errorId;
      friendlyError.timestamp = errorData.timestamp;
      friendlyError.errorCode = errorData.errorCode;
      friendlyError.errorType = errorData.errorType;
      
      // Spezifische Fehlermeldungen basierend auf dem Fehlercode
      if (errorData.errorCode === 'ENOENT') {
        friendlyError.message = 'Eine benötigte Datei wurde nicht gefunden. Bitte kontaktieren Sie den Administrator.';
      } else if (errorData.errorCode === 'EACCES') {
        friendlyError.message = 'Zugriffsfehler beim Lesen einer Datei. Bitte kontaktieren Sie den Administrator.';
      } else if (errorData.message && errorData.message.includes('Index-Datei nicht gefunden')) {
        friendlyError.message = 'Die Anwendung konnte nicht geladen werden. Bitte kontaktieren Sie den Administrator.';
      }
      
      // Werfe den Fehler, damit er von der ErrorBoundary aufgefangen werden kann
      throw friendlyError;
    }
    
    // Alte Prüfung auf "Something broke!" für Abwärtskompatibilität
    if (error.response.status === 500 && 
        (error.response.data === 'Something broke!' || 
         (typeof error.response.data === 'object' && error.response.data.error === 'Something broke!'))) {
      
      console.error('Kritischer Server-Fehler: "Something broke!" erkannt');
      
      // Erstelle einen benutzerfreundlichen Fehler
      const friendlyError = new Error('Ein kritischer Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
      friendlyError.name = 'ServerError';
      friendlyError.originalError = error;
      
      // Werfe den Fehler, damit er von der ErrorBoundary aufgefangen werden kann
      throw friendlyError;
    }
  } else if (error.request) {
    console.error('No response received:', error.request);
    
    // Netzwerkfehler behandeln
    const friendlyError = new Error('Keine Antwort vom Server erhalten. Bitte überprüfen Sie Ihre Internetverbindung.');
    friendlyError.name = 'NetworkError';
    friendlyError.originalError = error;
    throw friendlyError;
  } else {
    console.error('Error setting up request:', error.message);
    
    // Allgemeiner Fehler
    const friendlyError = new Error('Fehler bei der Anfrage: ' + error.message);
    friendlyError.name = 'RequestError';
    friendlyError.originalError = error;
    throw friendlyError;
  }
};

export default apiClient;