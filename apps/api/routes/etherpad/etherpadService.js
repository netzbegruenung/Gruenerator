import axios from 'axios';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('etherpad');


// Hardcoded Etherpad endpoints (ep_post_data flow)
const ETHERPAD_BASE_URL = 'https://textbegruenung.de';
const ETHERPAD_POST_PATH = '/post';
const ETHERPAD_PAD_BASE_URL = 'https://textbegruenung.de/p';

export async function createPadWithText(padId, text, documentType) {
  try {
    // Formatiere den Dokumenttyp (Kleinbuchstaben, Leerzeichen durch Bindestriche ersetzen)
    const formattedDocType = documentType ?
      documentType.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[äöüß]/g, match => {
          return {
            'ä': 'ae',
            'ö': 'oe',
            'ü': 'ue',
            'ß': 'ss'
          }[match];
        }) : '';

    // Erstelle eine formatierte padId mit Dokumenttyp
    const formattedPadId = formattedDocType ?
      `${formattedDocType}-${padId}` :
      padId;

    // Respect ep_post_data 100k character limit
    const MAX_LEN = 100000;
    const payload = typeof text === 'string' ? text.slice(0, MAX_LEN) : String(text).slice(0, MAX_LEN);

    // Proactively create pad by visiting its URL (Etherpad auto-creates on first access)
    try {
      await axios.get(`${ETHERPAD_PAD_BASE_URL}/${formattedPadId}`, {
        // We don't need the body; small timeout is fine
        timeout: 5000,
        validateStatus: () => true
      });
    } catch (ignore) {
      // Ignore any errors; pad creation is best-effort
    }

    // Post to ep_post_data endpoint
    const url = `${ETHERPAD_BASE_URL}${ETHERPAD_POST_PATH}`;
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-PAD-ID': formattedPadId,
          'x-pad-id': formattedPadId
        },
        maxBodyLength: MAX_LEN,
        validateStatus: (status) => status >= 200 && status < 400
      });
      if (process.env.NODE_ENV === 'development') {
        log.debug('ep_post_data response:', response.status);
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      // If the endpoint is not available (plugin not installed), still return the pad URL
      if (status === 404 || status === 405) {
        log.warn('ep_post_data not available; proceeding with empty pad. Status:', status);
      } else {
        log.error('ep_post_data request failed:', status, typeof data === 'string' ? data.slice(0, 500) : data);
        throw new Error('Fehler bei der Kommunikation mit Etherpad');
      }
    }

    // Generate URL
    const padURL = `${ETHERPAD_PAD_BASE_URL}/${formattedPadId}`;
    return padURL;
  } catch (error) {
    log.error('Fehler bei Etherpad-API-Aufruf:', error.response ? error.response.data : error.message);
    throw new Error('Fehler bei der Kommunikation mit Etherpad');
  }
}
