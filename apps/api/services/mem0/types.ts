import type { MemoryCategory } from './categories.js';

export interface Mem0Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type MemoryConfidence = 'high' | 'medium' | 'low';
export type MemorySource = 'manual' | 'extracted' | 'explicit';

export interface Mem0MemoryMetadata {
  threadId?: string | undefined;
  messageId?: string | undefined;
  source?: MemorySource | undefined;
  /** Raw category string from mem0 extraction — use normalizeCategory() to get typed MemoryCategory */
  memoryType?: string | undefined;
  confidence?: MemoryConfidence | undefined;
  categories?: MemoryCategory[] | undefined;
  [key: string]: unknown;
}

export interface Mem0Memory {
  id: string;
  memory: string;
  hash?: string | undefined;
  metadata?: Mem0MemoryMetadata | undefined;
  score?: number | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  user_id?: string | undefined;
}

export interface Mem0HistoryRecord {
  id?: string | undefined;
  userId: string;
  memoryId: string;
  operation: 'add' | 'update' | 'delete' | 'delete_all';
  memoryText?: string | undefined;
  metadata?: Mem0MemoryMetadata | undefined;
  createdAt?: Date | undefined;
  threadId?: string | undefined;
  messageId?: string | undefined;
}
