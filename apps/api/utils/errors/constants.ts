/**
 * Error Constants
 * User-friendly error messages and configuration
 */

import type { ErrorCode } from './types.js';

/**
 * German user-friendly error messages
 */
export const ERROR_TYPES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Ungültige Eingabedaten',
  ATTACHMENT_ERROR: 'Fehler bei der Verarbeitung der Anhänge',
  AI_WORKER_ERROR: 'Fehler bei der KI-Textgenerierung',
  AUTHENTICATION_ERROR: 'Authentifizierung erforderlich',
  AUTHORIZATION_ERROR: 'Keine Berechtigung für diese Aktion',
  NETWORK_ERROR: 'Netzwerkfehler - bitte versuchen Sie es später erneut',
  INTERNAL_ERROR: 'Interner Serverfehler',
  TIMEOUT_ERROR: 'Anfrage-Timeout - bitte versuchen Sie es erneut',
  RATE_LIMIT_ERROR: 'Zu viele Anfragen - bitte warten Sie einen Moment',
  SEARCH_ERROR: 'Fehler bei der Suche',
  EMBEDDING_ERROR: 'Fehler bei der Embedding-Generierung',
  DATABASE_ERROR: 'Datenbankfehler',
  CACHE_ERROR: 'Cache-Fehler',
  RESOURCE_ERROR: 'Ressourcen erschöpft',
  UNKNOWN_ERROR: 'Unbekannter Fehler'
};

/**
 * Sensitive field names to redact in logs
 */
export const SENSITIVE_FIELDS = [
  'password',
  'token',
  'key',
  'secret',
  'embedding',
  'apiKey',
  'api_key',
  'authorization'
] as const;

/**
 * Maximum string length in log context before truncation
 */
export const MAX_LOG_STRING_LENGTH = 1000;
