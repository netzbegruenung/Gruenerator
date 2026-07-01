'use client';

import type { ChatApiClient } from '../context/ChatContext';
import type { RemoteThreadListAdapter } from '@assistant-ui/react';
import { createAssistantStream } from 'assistant-stream';
import { useAgentStore } from '../stores/chatStore';

interface ApiThread {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status?: string;
  threadType?: string;
  notebookCollectionId?: string | null;
  tags?: string[];
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
const notebookCollectionCache = new Map<string, string>();
const threadTagsCache = new Map<string, string[]>();

export function getThreadType(remoteId: string): string {
  return threadTypeCache.get(remoteId) || 'chat';
}

export function getNotebookCollectionId(remoteId: string): string | null {
  return notebookCollectionCache.get(remoteId) || null;
}

const EMPTY_TAGS: readonly string[] = [];

export function getThreadTags(remoteId: string): string[] {
  return (threadTagsCache.get(remoteId) ?? EMPTY_TAGS) as string[];
}

// Subscribers (ThreadListItem via useSyncExternalStore) re-render when a
// thread's tags change — either from a list() refresh or an inline edit. This
// keeps pills fresh without a per-item useState that would freeze the value at
// mount and show a recycled item's stale tags.
const tagListeners = new Set<() => void>();

export function subscribeThreadTags(cb: () => void): () => void {
  tagListeners.add(cb);
  return () => tagListeners.delete(cb);
}

function sameTags(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

/** Write tags into the cache and notify subscribers only when they changed,
 *  so a no-op list() refresh doesn't churn re-renders. Preserves the array
 *  reference on equality so useSyncExternalStore snapshots stay stable. */
function updateThreadTagsCache(remoteId: string, tags: string[]): void {
  if (sameTags(threadTagsCache.get(remoteId), tags)) return;
  threadTagsCache.set(remoteId, tags);
  tagListeners.forEach((l) => l());
}

/** Update the local tags cache after an edit so the sidebar reflects it
 *  without waiting for the next list() refresh. */
export function setThreadTagsCache(remoteId: string, tags: string[]): void {
  updateThreadTagsCache(remoteId, tags);
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
  let pendingInit: Promise<{ remoteId: string; externalId: undefined }> | null = null;

  return {
    async list() {
      try {
        const threads = await apiClient.get<ApiThread[]>('/api/chat-service/threads');
        cachedThreads = threads;

        // Auto-cleanup: delete stale empty threads (keep newest one).
        // Never reap the active or a just-created thread: a brand-new thread is
        // legitimately empty (no lastMessage) while its first message is still
        // streaming. Deleting it mid-send makes the backend's canAccessThread()
        // fail → SSE `error: 'Thread not found'`. Protect the current thread and
        // anything touched within a short window (the live stream may still
        // reference an id even after currentThreadId advanced to a newer draft).
        const currentThreadId = useAgentStore.getState().currentThreadId;
        const RECENT_THREAD_MS = 60_000;
        const isProtected = (t: ApiThread) =>
          t.id === currentThreadId ||
          Date.now() - new Date(t.updatedAt).getTime() < RECENT_THREAD_MS;

        const emptyThreads = threads.filter(
          (t) => t.agentId === agentId && !t.lastMessage && t.status !== 'archived'
        );
        if (emptyThreads.length > 1) {
          const [_keep, ...rest] = emptyThreads.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          const stale = rest.filter((t) => !isProtected(t));
          for (const t of stale) {
            apiClient.delete(`/api/chat-service/threads?threadId=${t.id}`).catch(() => {});
          }
          const staleIds = new Set(stale.map((t) => t.id));
          cachedThreads = threads.filter((t) => !staleIds.has(t.id));
        }

        const external = callbacks?.getExternalThreads?.() ?? [];

        // Populate thread type + notebook collection caches for ThreadListItem rendering
        for (const t of cachedThreads) {
          threadTypeCache.set(t.id, t.threadType || 'chat');
          if (t.notebookCollectionId) {
            notebookCollectionCache.set(t.id, t.notebookCollectionId);
          }
          updateThreadTagsCache(t.id, t.tags ?? []);
        }

        const apiEntries = cachedThreads.map((t) => {
          const updatedAt = new Date(t.updatedAt).getTime();
          return {
            remoteId: t.id,
            status: (t.status === 'archived' ? 'archived' : 'regular') as 'regular' | 'archived',
            title: t.title ?? undefined,
            externalId: undefined as string | undefined,
            custom: { updatedAt } as Record<string, unknown>,
            _updatedAt: updatedAt,
          };
        });

        const externalEntries = external.map((e) => {
          const updatedAt = new Date(e.updatedAt).getTime();
          return {
            remoteId: e.remoteId,
            status: 'regular' as const,
            title: e.title,
            externalId: e.externalId,
            custom: { updatedAt } as Record<string, unknown>,
            _updatedAt: updatedAt,
          };
        });

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
      if (pendingInit) return pendingInit;
      pendingInit = (async (): Promise<{ remoteId: string; externalId: undefined }> => {
        // assistant-ui contracts initialize() to mint a NEW remoteId per local thread.
        // Returning an existing thread's id makes its `then:` reducer overwrite
        // threadIdMap[remoteId] = mappingId(localId), aliasing two threadIds entries
        // to the same threadData slot and rendering the same thread twice in the sidebar.
        // Stale empty drafts are reaped by the auto-cleanup in list() below.
        const threadMode = useAgentStore.getState().threadMode;
        const result = await apiClient.post<{ id: string }>('/api/chat-service/threads', {
          agentId,
          threadType: threadMode,
        });
        threadTypeCache.set(result.id, threadMode);
        useAgentStore.getState().setCurrentThread(result.id);
        return { remoteId: result.id, externalId: undefined };
      })().finally(() => {
        pendingInit = null;
      });
      return pendingInit;
    },

    async rename(remoteId: string, title: string) {
      if (isExternal(remoteId)) return;
      await apiClient.patch('/api/chat-service/threads', { threadId: remoteId, title });
      if (useAgentStore.getState().currentThreadId === remoteId) {
        useAgentStore.getState().setCurrentThreadTitle(title);
      }
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

      useAgentStore.getState().setCurrentThreadTitle(thread.title ?? null);

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

        if (useAgentStore.getState().currentThreadId === remoteId) {
          useAgentStore.getState().setCurrentThreadTitle(title);
        }

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
