/**
 * Etherpad Service
 *
 * Handles communication with the Etherpad API for collaborative text editing.
 * Uses ep_post_data plugin for initial pad content population.
 */

import axios, { AxiosError } from 'axios';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('etherpad');

// ============================================================================
// Configuration
// ============================================================================

const ETHERPAD_BASE_URL = 'https://textbegruenung.de';
const ETHERPAD_POST_PATH = '/post';
const ETHERPAD_PAD_BASE_URL = 'https://textbegruenung.de/p';
const MAX_PAD_CONTENT_LENGTH = 100000; // ep_post_data 100k character limit

// ============================================================================
// Types
// ============================================================================

interface CreatePadOptions {
  padId: string;
  text: string;
  documentType?: string;
}

interface CreatePadResult {
  padUrl: string;
  padId: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format document type for use in pad ID
 * Converts to lowercase, replaces spaces with hyphens, and handles German umlauts
 */
function formatDocumentType(documentType: string): string {
  return documentType
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[äöüß]/g, (match) => {
      const replacements: Record<string, string> = {
        ä: 'ae',
        ö: 'oe',
        ü: 'ue',
        ß: 'ss',
      };
      return replacements[match] || match;
    });
}

/**
 * Generate formatted pad ID with optional document type prefix
 */
function generateFormattedPadId(padId: string, documentType?: string): string {
  if (!documentType) {
    return padId;
  }
  const formattedDocType = formatDocumentType(documentType);
  return `${formattedDocType}-${padId}`;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create a new Etherpad with initial text content
 *
 * @param options - Pad creation options
 * @returns Promise resolving to pad URL and ID
 * @throws Error if communication with Etherpad fails
 */
export async function createPadWithText(options: CreatePadOptions): Promise<CreatePadResult> {
  const { padId, text, documentType } = options;

  try {
    const formattedPadId = generateFormattedPadId(padId, documentType);

    // Truncate content to respect ep_post_data limit
    const payload =
      typeof text === 'string'
        ? text.slice(0, MAX_PAD_CONTENT_LENGTH)
        : String(text).slice(0, MAX_PAD_CONTENT_LENGTH);

    // Proactively create pad by visiting its URL (Etherpad auto-creates on first access)
    try {
      await axios.get(`${ETHERPAD_PAD_BASE_URL}/${formattedPadId}`, {
        timeout: 5000,
        validateStatus: () => true,
      });
    } catch {
      // Ignore errors - pad creation is best-effort
    }

    // Post content to ep_post_data endpoint
    const url = `${ETHERPAD_BASE_URL}${ETHERPAD_POST_PATH}`;

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-PAD-ID': formattedPadId,
          'x-pad-id': formattedPadId,
        },
        maxBodyLength: MAX_PAD_CONTENT_LENGTH,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      if (process.env.NODE_ENV === 'development') {
        log.debug('ep_post_data response:', response.status);
      }
    } catch (err) {
      const axiosError = err as AxiosError;
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;

      // If the endpoint is not available (plugin not installed), still return the pad URL
      if (status === 404 || status === 405) {
        log.warn('ep_post_data not available; proceeding with empty pad. Status:', status);
      } else {
        const errorData = typeof data === 'string' ? data.slice(0, 500) : data;
        log.error('ep_post_data request failed:', status, errorData);
        throw new Error('Fehler bei der Kommunikation mit Etherpad');
      }
    }

    const padUrl = `${ETHERPAD_PAD_BASE_URL}/${formattedPadId}`;

    return {
      padUrl,
      padId: formattedPadId,
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    log.error('Fehler bei Etherpad-API-Aufruf:', axiosError.response?.data || axiosError.message);
    throw new Error('Fehler bei der Kommunikation mit Etherpad');
  }
}

// ============================================================================
// Export Service Object
// ============================================================================

const EtherpadService = {
  createPadWithText,
};

export default EtherpadService;
