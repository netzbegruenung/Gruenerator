'use client';

import type { ChatApiClient } from '../context/ChatContext';
import type { unstable_RemoteThreadListAdapter as RemoteThreadListAdapter } from '@assistant-ui/react';
import { createAssistantStream } from 'assistant-stream';

interface ApiThread {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status?: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    role: string;
    created_at: string;
  } | null;
}

export function createGrueneratorThreadListAdapter(
  apiClient: ChatApiClient,
  agentId: string
): RemoteThreadListAdapter {
  return {
    async list() {
      try {
        const threads = await apiClient.get<ApiThread[]>('/api/chat-service/threads');
        return {
          threads: threads.map((t) => ({
            remoteId: t.id,
            status: (t.status === 'archived' ? 'archived' : 'regular') as 'regular' | 'archived',
            title: t.title ?? undefined,
          })),
        };
      } catch (error) {
        console.warn('[ThreadList] Failed to fetch threads:', error);
        return { threads: [] };
      }
    },

    async initialize(_localId: string) {
      const result = await apiClient.post<{ id: string }>('/api/chat-service/threads', {
        agentId,
      });
      return { remoteId: result.id, externalId: undefined };
    },

    async rename(remoteId: string, title: string) {
      await apiClient.patch('/api/chat-service/threads', { threadId: remoteId, title });
    },

    async archive(remoteId: string) {
      await apiClient.patch('/api/chat-service/threads', {
        threadId: remoteId,
        status: 'archived',
      });
    },

    async unarchive(remoteId: string) {
      await apiClient.patch('/api/chat-service/threads', { threadId: remoteId, status: 'regular' });
    },

    async delete(remoteId: string) {
      await apiClient.delete(`/api/chat-service/threads?threadId=${remoteId}`);
    },

    async fetch(remoteId: string) {
      const threads = await apiClient.get<ApiThread[]>('/api/chat-service/threads');
      const thread = threads.find((t) => t.id === remoteId);
      if (!thread) throw new Error(`Thread ${remoteId} not found`);
      return {
        remoteId: thread.id,
        status: (thread.status === 'archived' ? 'archived' : 'regular') as 'regular' | 'archived',
        title: thread.title ?? undefined,
      };
    },

    async generateTitle(_remoteId, messages) {
      return createAssistantStream((controller) => {
        const firstUserMsg = messages.find((m) => m.role === 'user');
        if (!firstUserMsg) {
          controller.appendText('Neue Unterhaltung');
          return;
        }

        const textParts = firstUserMsg.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text);
        const fullText = textParts.join(' ').trim();

        if (!fullText) {
          controller.appendText('Neue Unterhaltung');
          return;
        }

        const sentenceEnd = fullText.search(/[.!?]/);
        let title = sentenceEnd > 0 ? fullText.slice(0, sentenceEnd) : fullText;
        if (title.length > 50) {
          title = title.slice(0, 47) + '...';
        }
        controller.appendText(title);
      });
    },
  };
}
