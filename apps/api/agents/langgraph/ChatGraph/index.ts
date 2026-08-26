/**
 * ChatGraph Public Exports
 *
 * The node functions of the chat pipeline (classify → search → rerank →
 * respond) plus its state initialiser.
 *
 * There is deliberately NO compiled graph here. The routers sequence these
 * nodes themselves — see `routes/chat/chatGraphContractRouter.ts`. The compiled
 * `chatGraph` that used to be exported had zero production callers and was
 * removed; do not reintroduce one without also moving the routers onto it.
 */

export { initializeChatState } from './ChatGraph.js';
export {
  classifierNode,
  briefGeneratorNode,
  wantsResearchBrief,
  searchNode,
  rerankNode,
  imageNode,
  imageEditNode,
  summarizeNode,
  computeNode,
  pandasComputeNode,
  computeVerifierNode,
  respondNode,
  buildSystemMessage,
} from './nodes/index.js';
export {
  buildCitations,
  COLLECTION_LABELS,
  getDefaultCollectionsForLocale,
} from './nodes/searchNode.js';

export type {
  ChatGraphInput,
  ChatGraphOutput,
  ChatGraphState,
  SearchIntent,
  SearchSource,
  GatherSource,
  SearchResult,
  Citation,
  ClassificationResult,
  ImageStyle,
  GeneratedImageResult,
  ProcessedAttachment,
  ImageAttachment,
  ThreadAttachment,
  UserLocale,
} from './types.js';
