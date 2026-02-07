/**
 * Mem0 Service Exports
 *
 * Cross-thread, per-user memory persistence for the chat system.
 */

export { Mem0Service, getMem0Instance } from './Mem0Service.js';
export { buildMem0Config, validateMem0Environment, isMem0Available } from './config.js';
export type {
  Mem0Message,
  Mem0Memory,
  Mem0MemoryMetadata,
  Mem0HistoryRecord,
} from './types.js';
