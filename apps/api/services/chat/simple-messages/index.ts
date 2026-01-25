/**
 * Simple Message Detection Service
 * Utilities for detecting and responding to simple greetings
 */

// Class exports
export { SimpleMessageDetector, simpleMessageDetector } from './SimpleMessageDetector.js';

// Named function exports (backward compatibility)
export {
  detectSimpleMessage,
  generateSimpleResponse,
  loadConfig,
} from './SimpleMessageDetector.js';

// Type exports
export type {
  CategoryConfig,
  SimpleMessagesConfig,
  SimpleMessageDetectionResult,
} from './types.js';
