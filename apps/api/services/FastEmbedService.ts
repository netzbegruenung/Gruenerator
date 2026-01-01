/**
 * FastEmbedService - Backward Compatibility Wrapper
 *
 * @deprecated Use mistralEmbeddingService from mistral/index.js instead
 *
 * This wrapper maintains backward compatibility for code using the old FastEmbedService name.
 * The service has been renamed to MistralEmbeddingService to accurately reflect that it uses
 * the Mistral API, not the FastEmbed package.
 *
 * Old import:
 * import { fastEmbedService } from '../services/FastEmbedService.js';
 *
 * New import (recommended):
 * import { mistralEmbeddingService } from '../services/mistral/index.js';
 */

// Re-export everything from the new location
export * from './mistral/MistralEmbeddingService/index.js';

// Create backward compatibility alias
import { mistralEmbeddingService } from './mistral/MistralEmbeddingService/index.js';

/**
 * @deprecated Use mistralEmbeddingService instead
 */
export const fastEmbedService = mistralEmbeddingService;
