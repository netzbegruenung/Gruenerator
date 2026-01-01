// Shared adapter helpers (CommonJS)

function mergeMetadata(requestMetadata = {}, responseMetadata = {}) {
  return {
    ...requestMetadata,
    ...responseMetadata,
    provider: responseMetadata.provider,
    model: responseMetadata.model,
    timestamp: responseMetadata.timestamp
  };
}

export { mergeMetadata };