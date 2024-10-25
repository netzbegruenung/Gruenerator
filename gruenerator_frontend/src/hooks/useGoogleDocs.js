import { useCallback, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

// Ersetzen Sie dies durch Ihre tatsächliche Client-ID
const CLIENT_ID = 'IHRE_GOOGLE_CLIENT_ID';
const API_KEY = 'IHR_GOOGLE_API_KEY';

// Definieren Sie den Bereich für die Docs API
const SCOPES = 'https://www.googleapis.com/auth/documents';

const useGoogleDocs = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      setError(null);

      try {
        // Laden Sie die Google Docs API
        await loadGoogleDocsAPI();

        // Erstellen Sie ein neues Dokument
        const doc = await createNewDocument(tokenResponse.access_token);

        // Fügen Sie den Inhalt zum Dokument hinzu
        await insertContent(doc.documentId, tokenResponse.access_token, content);

        // Öffnen Sie das Dokument in einem neuen Tab
        window.open(`https://docs.google.com/document/d/${doc.documentId}/edit`, '_blank');

        setIsLoading(false);
      } catch (err) {
        console.error('Fehler beim Exportieren zu Google Docs:', err);
        setError('Es gab einen Fehler beim Exportieren zu Google Docs. Bitte versuchen Sie es später erneut.');
        setIsLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google Login fehlgeschlagen:', error);
      setError('Die Anmeldung bei Google war nicht erfolgreich. Bitte versuchen Sie es erneut.');
    },
    scope: SCOPES.join(' '),
  });

  const loadGoogleDocsAPI = () => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('client', () => {
          window.gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ['https://docs.googleapis.com/$discovery/rest?version=v1'],
          }).then(resolve, reject);
        });
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  const createNewDocument = async (accessToken) => {
    const response = await window.gapi.client.docs.documents.create({
      title: 'Neues Gruenerator Dokument',
    });
    return response.result;
  };

  const insertContent = async (documentId, accessToken, content) => {
    await window.gapi.client.docs.documents.batchUpdate({
      documentId: documentId,
      resource: {
        requests: [
          {
            insertText: {
              location: {
                index: 1,
              },
              text: content,
            },
          },
        ],
      },
    });
  };

  const exportToGoogleDocs = useCallback(async (content) => {
    setIsLoading(true);
    setError(null);
    try {
      await login();
      // Der Rest der Logik wird in der onSuccess-Funktion behandelt
    } catch (err) {
      console.error('Fehler beim Exportieren zu Google Docs:', err);
      setError('Es gab einen Fehler beim Exportieren zu Google Docs. Bitte versuchen Sie es später erneut.');
      setIsLoading(false);
    }
  }, [login]);

  return { exportToGoogleDocs, isLoading, error };
};

export default useGoogleDocs;
