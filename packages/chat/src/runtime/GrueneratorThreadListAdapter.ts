'use client';

import type { ChatApiClient } from '../context/ChatContext';
import type { unstable_RemoteThreadListAdapter as RemoteThreadListAdapter } from '@assistant-ui/react';
import { createAssistantStream } from 'assistant-stream';
import { useAgentStore } from '../stores/chatStore';

interface ApiThread {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status?: string;
  threadType?: string;
  accessType?: 'owner' | 'shared' | 'group';
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    role: string;
    created_at: string;
  } | null;
}

export interface ExternalThreadEntry {
  remoteId: string;
  title: string;
  externalId: string;
  updatedAt: string;
}

const EXTERNAL_PREFIX = 'notebook:';

// Module-level thread type cache — populated by list() and accessible by ThreadListItem
const threadTypeCache = new Map<string, string>();

export function getThreadType(remoteId: string): string {
  return threadTypeCache.get(remoteId) || 'chat';
}

function isExternal(remoteId: string) {
  return remoteId.startsWith(EXTERNAL_PREFIX);
}

export function createGrueneratorThreadListAdapter(
  apiClient: ChatApiClient,
  agentId: string,
  callbacks?: {
    onDelete?: (remoteId: string) => void;
    getExternalThreads?: () => ExternalThreadEntry[];
  }
): RemoteThreadListAdapter {
  let cachedThreads: ApiThread[] = [];

  return {
    async list() {
      try {
        const threads = await apiClient.get<ApiThread[]>('/api/chat-service/threads');
        cachedThreads = threads;

        // Auto-cleanup: delete stale empty threads (keep newest one)
        const emptyThreads = threads.filter(
          (t) => t.agentId === agentId && !t.lastMessage && t.status !== 'archived'
        );
        if (emptyThreads.length > 1) {
          const [_keep, ...stale] = emptyThreads.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          for (const t of stale) {
            apiClient.delete(`/api/chat-service/threads?threadId=${t.id}`).catch(() => {});
          }
          const staleIds = new Set(stale.map((t) => t.id));
          cachedThreads = threads.filter((t) => !staleIds.has(t.id));
        }

        const external = callbacks?.getExternalThreads?.() ?? [];

        // Populate thread type cache for ThreadListItem badge rendering
        for (const t of cachedThreads) {
          threadTypeCache.set(t.id, t.threadType || 'chat');
        }

        const apiEntries = cachedThreads.map((t) => ({
          remoteId: t.id,
          status: (t.status === 'archived' ? 'archived' : 'regular') as 'regular' | 'archived',
          title: t.title ?? undefined,
          externalId: undefined as string | undefined,
          _updatedAt: new Date(t.updatedAt).getTime(),
        }));

        const externalEntries = external.map((e) => ({
          remoteId: e.remoteId,
          status: 'regular' as const,
          title: e.title,
          externalId: e.externalId,
          _updatedAt: new Date(e.updatedAt).getTime(),
        }));

        const all = [...apiEntries, ...externalEntries].sort((a, b) => b._updatedAt - a._updatedAt);

        return {
          threads: all.map(({ _updatedAt, ...rest }) => rest),
        };
      } catch (error) {
        console.warn('[ThreadList] Failed to fetch threads:', error);
        return { threads: [] };
      }
    },

    async initialize(_localId: string) {
      const threadMode = useAgentStore.getState().threadMode;
      const emptyThread = cachedThreads.find(
        (t) => t.agentId === agentId && !t.lastMessage && t.status !== 'archived'
      );
      if (emptyThread) {
        return { remoteId: emptyThread.id, externalId: undefined };
      }
      const result = await apiClient.post<{ id: string }>('/api/chat-service/threads', {
        agentId,
        threadType: threadMode,
      });
      return { remoteId: result.id, externalId: undefined };
    },

    async rename(remoteId: string, title: string) {
      if (isExternal(remoteId)) return;
      await apiClient.patch('/api/chat-service/threads', { threadId: remoteId, title });
    },

    async archive(remoteId: string) {
      if (isExternal(remoteId)) return;
      await apiClient.patch('/api/chat-service/threads', {
        threadId: remoteId,
        status: 'archived',
      });
    },

    async unarchive(remoteId: string) {
      if (isExternal(remoteId)) return;
      await apiClient.patch('/api/chat-service/threads', { threadId: remoteId, status: 'regular' });
    },

    async delete(remoteId: string) {
      if (isExternal(remoteId)) return;
      callbacks?.onDelete?.(remoteId);
      await apiClient.delete(`/api/chat-service/threads?threadId=${remoteId}`);
    },

    async fetch(remoteId: string) {
      if (isExternal(remoteId)) {
        const ext = callbacks?.getExternalThreads?.().find((e) => e.remoteId === remoteId);
        if (ext) {
          return {
            remoteId: ext.remoteId,
            status: 'regular' as const,
            title: ext.title,
            externalId: ext.externalId,
          };
        }
        throw new Error(`External thread ${remoteId} not found`);
      }

      const threads = await apiClient.get<ApiThread[]>('/api/chat-service/threads');
      const thread = threads.find((t) => t.id === remoteId);
      if (!thread) throw new Error(`Thread ${remoteId} not found`);

      // Restore threadMode from the loaded thread's type
      const threadType = thread.threadType || 'chat';
      if (threadType === 'chat' || threadType === 'notebook' || threadType === 'search') {
        useAgentStore.getState().setThreadMode(threadType);
      }

      return {
        remoteId: thread.id,
        status: (thread.status === 'archived' ? 'archived' : 'regular') as 'regular' | 'archived',
        title: thread.title ?? undefined,
      };
    },

    async generateTitle(remoteId, messages) {
      if (isExternal(remoteId)) {
        return createAssistantStream((controller) => {
          const ext = callbacks?.getExternalThreads?.().find((e) => e.remoteId === remoteId);
          controller.appendText(ext?.title ?? 'Notebook');
        });
      }

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

        apiClient
          .patch('/api/chat-service/threads', { threadId: remoteId, title })
          .catch((err) => console.error('[TitleGen] PATCH fallback title FAILED:', err));

        apiClient
          .post(`/api/chat-service/threads/${remoteId}/generate-title`)
          .catch((err) => console.error('[TitleGen] POST generate-title FAILED:', err));
      });
    },
  };
}
