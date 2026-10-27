// Data-URL parsing lives in @gruenerator/contracts, which the canvas editor also
// reads; this package keeps its export names.
export {
  decodedByteLength,
  extractBase64,
  isDataUrl,
  parseDataUrl,
  stripDataUrlPrefix,
  type ParsedDataUrl,
} from '@gruenerator/contracts';
