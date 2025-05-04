import apiClient from '../../../components/utils/apiClient';

/**
 * Generates a description for an Antrag using Claude-3.5-Haiku.
 * 
 * @param {object} params - The parameters for description generation.
 * @param {string} params.title - The title of the Antrag.
 * @param {string} params.antragstext - The content of the Antrag (in HTML or Markdown format).
 * @returns {Promise<string>} The generated description.
 * @throws {Error} Throws an error if the API call fails.
 */
export const generateAntragDescription = async ({ title, antragstext }) => {
    // Basic validation
    if (!title || !antragstext) {
        console.error('[antragDescriptionUtils] Fehlende Daten für die Beschreibungsgenerierung:', { title, hasAntragstext: !!antragstext });
        throw new Error('Titel und Antragstext werden für die Beschreibungsgenerierung benötigt.');
    }

    try {
        console.log('[antragDescriptionUtils] Starte Beschreibungsgenerierung für:', title);
        
        // Call the backend API
        const response = await apiClient.post('/antraege/generate-description', {
            title,
            antragstext
        });

        // Extract the description from the response
        const { description, success } = response.data;
        
        if (!success || !description) {
            throw new Error('Die Beschreibungsgenerierung war nicht erfolgreich.');
        }

        console.log('[antragDescriptionUtils] Beschreibung erfolgreich generiert:', description);
        return description;

    } catch (error) {
        // Log the error details
        console.error('[antragDescriptionUtils] Fehler bei der Beschreibungsgenerierung:', error);
        
        // Extract a user-friendly error message
        const errorMessage = error.response?.data?.error || 
                           error.response?.data?.details ||
                           error.message || 
                           'Fehler bei der Generierung der Beschreibung.';
        
        // Re-throw with a user-friendly message
        throw new Error(errorMessage);
    }
}; 