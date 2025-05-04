import apiClient from '../../../components/utils/apiClient';
import { convertHtmlToMarkdown } from '../../../utils/markdownUtils';

/**
 * Saves the Antrag data to the backend.
 * Converts antrags text from HTML to Markdown before sending.
 * @param {object} payload - The data payload for the Antrag.
 * @param {string} payload.antragstext - The Antrag content in HTML format.
 * @param {string} payload.title - The title of the Antrag.
 * @param {string} payload.status - The status of the Antrag.
 * @param {string} [payload.antragsteller] - The applicant.
 * @param {string} [payload.description] - Optional description.
 * @param {string} [payload.kontakt_email] - Optional contact email.
 * @param {boolean} [payload.kontakt_erlaubt] - Optional contact permission.
 * @param {boolean} [payload.is_private] - Optional privacy flag.
 * @returns {Promise<object>} The saved Antrag data from the backend.
 * @throws {Error} Throws an error if validation, conversion, or API call fails.
 */
export const saveAntrag = async (payload) => {
    // Basic payload validation
    if (!payload || typeof payload.antragstext !== 'string' || !payload.title || !payload.status) {
        console.error('[antragSaveUtils] Invalid payload for saving (missing fields or antrgstext not string):', payload);
        throw new Error('Fehlende oder ungültige Daten zum Speichern (Titel, Status, Antragstext müssen vorhanden sein).');
    }

    // --- HTML to Markdown Conversion ---
    let markdownContent;
    try {
        markdownContent = convertHtmlToMarkdown(payload.antragstext);
        console.log('[antragSaveUtils] Converted HTML to Markdown using utility.');
    } catch (conversionError) {
        console.error('[antragSaveUtils] Error converting HTML to Markdown via utility:', conversionError);
        throw new Error('Fehler bei der Konvertierung des Antragstextes vor dem Speichern.');
    }
    // --- End Conversion ---

    // Create the final payload with the converted markdown content
    const finalPayload = {
        ...payload, // Keep other metadata
        antragstext: markdownContent // Replace HTML with Markdown
    };

    console.log('[antragSaveUtils] Attempting to save Antrag via apiClient to /antraege...');
    console.log('[antragSaveUtils] Payload to send (Markdown):', finalPayload);

    try {
        // Use the correct endpoint '/antraege' (relative to baseURL)
        const response = await apiClient.post('/antraege', finalPayload);

        // Axios automatically throws on >= 400 status codes.
        // If successful, response.data contains the backend response.
        const savedAntrag = response.data;
        console.log('[antragSaveUtils] Antrag erfolgreich gespeichert via API:', savedAntrag);

        // Return the saved data on success
        return savedAntrag;

    } catch (error) {
        // Log the detailed error
        console.error('[antragSaveUtils] Error saving Antrag via API:', error);

        // Extract a user-friendly error message
        const errorMessage = error.response?.data?.error || // Check backend structured error
                           error.response?.data?.message || // Check backend structured message
                           error.message || // General axios/network error message
                           'Unbekannter Fehler beim Speichern.';

        // Re-throw a new error with the processed message
        throw new Error(errorMessage);
    }
    // No finally block needed here as state is not managed in this function
}; 