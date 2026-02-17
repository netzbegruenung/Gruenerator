/**
 * Thread Management Service
 *
 * REST client for chat thread and message CRUD operations.
 * Uses the global API client with JWT bearer auth.
 */

import { getGlobalApiClient } from '@gruenerator/shared/api';

export interface Thread {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    role: string;
    created_at: string;
  } | null;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  parts?: Array<{ type: string; text?: string; toolInvocation?: unknown }>;
  toolInvocations?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    state: string;
    result?: unknown;
  }>;
  metadata?: {
    intent?: string;
    searchCount?: number;
    citations?: Array<{
      id: number;
      title: string;
      url: string;
      snippet?: string;
      domain?: string;
    }>;
  };
}

const THREADS_ENDPOINT = '/chat-service/threads';
const MESSAGES_ENDPOINT = '/chat-service/messages';

export async function listThreads(): Promise<Thread[]> {
  const client = getGlobalApiClient();
  const response = await client.get<Thread[]>(THREADS_ENDPOINT);
  return response?.data || [];
}

export async function loadMessages(threadId: string): Promise<Message[]> {
  const client = getGlobalApiClient();
  const response = await client.get<Message[]>(MESSAGES_ENDPOINT, {
    params: { threadId },
  });
  return response?.data || [];
}

export async function deleteThread(threadId: string): Promise<void> {
  const client = getGlobalApiClient();
  await client.delete(THREADS_ENDPOINT, { params: { threadId } });
}

export async function updateThread(
  threadId: string,
  updates: { title?: string; status?: string }
): Promise<void> {
  const client = getGlobalApiClient();
  await client.patch(THREADS_ENDPOINT, { threadId, ...updates });
}
