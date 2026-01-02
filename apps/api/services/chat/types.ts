/**
 * Type definitions for Chat Memory Service
 */

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Individual conversation message
 */
export interface ConversationMessage {
  role: MessageRole;
  content: string;
  timestamp: number;
  agent?: string;
}

/**
 * Pending information request details
 */
export interface PendingRequest {
  type: string;
  timestamp: number;
  [key: string]: any;
}

/**
 * Conversation metadata
 */
export interface ConversationMetadata {
  lastAgent?: string;
  lastUpdated?: number;
  messageCount?: number;
  pendingRequest?: PendingRequest;
}

/**
 * Complete conversation object
 */
export interface Conversation {
  messages: ConversationMessage[];
  metadata: ConversationMetadata;
}

/**
 * Conversation statistics for debugging
 */
export interface ConversationStats {
  userId: string;
  messageCount: number;
  lastAgent: string | null;
  lastUpdated: number | null;
  expiresIn: number | null;
}

/**
 * Experimental Antrag session data
 */
export interface ExperimentalSession {
  sessionId: string;
  userId: string;
  conversationState: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  [key: string]: any;
}

/**
 * Session summary for listing user sessions
 */
export interface SessionSummary {
  sessionId: string;
  conversationState: string;
  thema?: string;
  requestType?: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Recent form value record
 */
export interface RecentValue {
  id?: number;
  user_id: string;
  field_type: string;
  field_value: string;
  form_name?: string | null;
  created_at?: Date;
}

/**
 * Field type with usage statistics
 */
export interface FieldTypeWithCount {
  field_type: string;
  value_count: number;
  last_used: Date;
}
