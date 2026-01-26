import type { RequestMetadata, ResponseMetadata } from './types.js';

export function mergeMetadata(
  requestMetadata: RequestMetadata = {},
  responseMetadata: ResponseMetadata
): ResponseMetadata & RequestMetadata {
  return {
    ...requestMetadata,
    ...responseMetadata,
    provider: responseMetadata.provider,
    model: responseMetadata.model,
    timestamp: responseMetadata.timestamp,
  };
}
