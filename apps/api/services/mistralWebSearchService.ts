/**
 * mistralWebSearchService - Backward Compatibility Wrapper
 *
 * @deprecated Import from mistral/index.js instead
 *
 * This wrapper maintains backward compatibility for code using the old import path.
 * The service has been reorganized into the mistral/ folder with a modular structure.
 *
 * Old import:
 * import MistralWebSearchService from '../services/mistralWebSearchService.js';
 *
 * New import (recommended):
 * import { MistralWebSearchService } from '../services/mistral/index.js';
 */

// Re-export everything from the new location
export * from './mistral/MistralWebSearchService/index.js';

// Default export for backward compatibility
export { default } from './mistral/MistralWebSearchService/index.js';
