/**
 * Mem0 Service Type Definitions
 *
 * TypeScript interfaces for the mem0 memory service.
 * Used for cross-thread, per-user memory persistence.
 */

/**
 * A message in the conversation for memory extraction.
 */
export interface Mem0Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Metadata attached to a memory.
 */
export interface Mem0MemoryMetadata {
  threadId?: string;
  messageId?: string;
  source?: string;
  memoryType?: 'preference' | 'fact' | 'context' | 'instruction';
  [key: string]: unknown;
}

/**
 * A single memory stored by mem0.
 * This is our wrapper type around mem0ai's MemoryItem.
 */
export interface Mem0Memory {
  id: string;
  memory: string;
  hash?: string;
  metadata?: Mem0MemoryMetadata;
  score?: number;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

/**
 * Memory history record for GDPR compliance.
 */
export interface Mem0HistoryRecord {
  id?: string;
  userId: string;
  memoryId: string;
  operation: 'add' | 'update' | 'delete' | 'delete_all';
  memoryText?: string;
  metadata?: Mem0MemoryMetadata;
  createdAt?: Date;
  threadId?: string;
  messageId?: string;
}
