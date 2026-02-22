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
  agentId: string,
  callbacks?: { onDelete?: (remoteId: string) => void }
): RemoteThreadListAdapter {
  return {
    async list() {
      try {
        const threads = await apiClient.get<ApiThread[]>('/api/chat-service/threads');
        console.log(
          '[ThreadList] Fetched threads:',
          threads.map((t) => ({ id: t.id, title: t.title, status: t.status }))
        );
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
      callbacks?.onDelete?.(remoteId);
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

    async generateTitle(remoteId, messages) {
      console.log('[TitleGen] generateTitle called', {
        remoteId,
        messageCount: messages.length,
        roles: messages.map((m) => m.role),
      });

      return createAssistantStream((controller) => {
        const firstUserMsg = messages.find((m) => m.role === 'user');
        if (!firstUserMsg) {
          console.warn('[TitleGen] No user message found — returning default title');
          controller.appendText('Neue Unterhaltung');
          return;
        }

        console.log(
          '[TitleGen] firstUserMsg content parts:',
          firstUserMsg.content.map((p) => ({
            type: p.type,
            length: p.type === 'text' ? (p as any).text?.length : undefined,
          }))
        );

        const textParts = firstUserMsg.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text);
        const fullText = textParts.join(' ').trim();

        if (!fullText) {
          console.warn('[TitleGen] fullText is empty — returning default title');
          controller.appendText('Neue Unterhaltung');
          return;
        }

        const sentenceEnd = fullText.search(/[.!?]/);
        let title = sentenceEnd > 0 ? fullText.slice(0, sentenceEnd) : fullText;
        if (title.length > 50) {
          title = title.slice(0, 47) + '...';
        }
        console.log(
          '[TitleGen] Computed fallback title:',
          JSON.stringify(title),
          'from fullText:',
          JSON.stringify(fullText.slice(0, 100))
        );
        controller.appendText(title);

        // Persist fallback title to DB immediately
        apiClient
          .patch('/api/chat-service/threads', { threadId: remoteId, title })
          .then((res) => console.log('[TitleGen] PATCH fallback title response:', res))
          .catch((err) => console.error('[TitleGen] PATCH fallback title FAILED:', err));

        // Trigger async AI title generation (upgrades to Mistral-generated title)
        apiClient
          .post(`/api/chat-service/threads/${remoteId}/generate-title`)
          .then((res) => console.log('[TitleGen] POST generate-title response:', res))
          .catch((err) => console.error('[TitleGen] POST generate-title FAILED:', err));
      });
    },
  };
}
