import { z } from 'zod';

export const chatMessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;

export const chatMessageStatusSchema = z.enum(['running', 'complete', 'incomplete']);
export type ChatMessageStatus = z.infer<typeof chatMessageStatusSchema>;

export const chatToolCallSchema = z
  .object({
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.record(z.string(), z.unknown()).optional().default({}),
    state: z.enum(['call', 'result', 'error']).optional(),
    result: z.unknown().optional(),
  })
  .passthrough();
export type ChatToolCall = z.infer<typeof chatToolCallSchema>;

export const chatCitationSchema = z
  .object({
    id: z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    sourceType: z.string().optional(),
  })
  .passthrough();
export type ChatCitation = z.infer<typeof chatCitationSchema>;

export const chatMessageMetadataSchema = z
  .object({
    intent: z.string().optional(),
    searchCount: z.number().optional(),
    citations: z.array(chatCitationSchema).optional(),
    searchResults: z.array(z.unknown()).optional(),
    roleName: z.string().optional(),
    senderId: z.string().nullable().optional(),
    senderName: z.string().nullable().optional(),
    followUpSuggestions: z.array(z.string()).optional(),
    generatedImage: z.unknown().optional(),
    streamMetadata: z.unknown().optional(),
  })
  .passthrough();
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  threadId: z.string().nullable().default(null),
  role: chatMessageRoleSchema,
  content: z.string().default(''),
  userId: z.string().nullable().default(null),
  createdAt: z.string().optional(),
  status: chatMessageStatusSchema.default('complete'),
  toolCalls: z.array(chatToolCallSchema).optional(),
  metadata: chatMessageMetadataSchema.optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

interface DbChatMessageRow {
  id: string;
  thread_id: string | null;
  role: string;
  content: string | null;
  user_id: string | null;
  created_at: Date | string | null;
  tool_calls?: unknown;
  tool_results?: unknown;
  sender_name?: string | null;
}

export function rowToChatMessage(row: DbChatMessageRow): ChatMessage {
  return chatMessageSchema.parse({
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content ?? '',
    userId: row.user_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at ?? undefined),
    status: 'complete',
    toolCalls: Array.isArray(row.tool_calls) ? row.tool_calls : undefined,
    metadata: row.sender_name ? { senderName: row.sender_name } : undefined,
  });
}

const messagesEndpointItemSchema = z
  .object({
    id: z.string(),
    role: chatMessageRoleSchema,
    content: z.string().default(''),
    createdAt: z.union([z.string(), z.date()]).optional(),
    toolInvocations: z.array(chatToolCallSchema).optional(),
    metadata: chatMessageMetadataSchema.optional(),
  })
  .passthrough();
export const messagesEndpointResponseSchema = z.array(messagesEndpointItemSchema);
export type MessagesEndpointResponse = z.infer<typeof messagesEndpointResponseSchema>;

export function endpointMessageToChatMessage(
  raw: z.infer<typeof messagesEndpointItemSchema>,
  threadId: string
): ChatMessage {
  return chatMessageSchema.parse({
    id: raw.id,
    threadId,
    role: raw.role,
    content: raw.content,
    userId: raw.metadata?.senderId ?? null,
    createdAt:
      raw.createdAt instanceof Date ? raw.createdAt.toISOString() : (raw.createdAt ?? undefined),
    status: 'complete',
    toolCalls: raw.toolInvocations,
    metadata: raw.metadata,
  });
}

// Minimal wire-format validator for /api/chat-service/messages that
// `convertToThreadMessageLike` consumes downstream. Looser than the
// canonical ChatMessage above — accepts only the fields the converter reads.
export const loadedThreadMessageSchema = z.object({
  id: z.string(),
  // assistant-ui's converter only handles user/assistant; system messages
  // are filtered server-side, so a narrower role enum is intentional here.
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const loadedThreadMessagesSchema = z.array(loadedThreadMessageSchema);
export type LoadedThreadMessage = z.infer<typeof loadedThreadMessageSchema>;
