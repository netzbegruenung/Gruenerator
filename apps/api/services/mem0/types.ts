import type { MemoryCategory } from './categories.js';

export interface Mem0Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type MemoryConfidence = 'high' | 'medium' | 'low';
export type MemorySource = 'manual' | 'extracted' | 'explicit';

export interface Mem0MemoryMetadata {
  threadId?: string;
  messageId?: string;
  source?: MemorySource;
  /** Raw category string from mem0 extraction — use normalizeCategory() to get typed MemoryCategory */
  memoryType?: string;
  confidence?: MemoryConfidence;
  categories?: MemoryCategory[];
  [key: string]: unknown;
}

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
