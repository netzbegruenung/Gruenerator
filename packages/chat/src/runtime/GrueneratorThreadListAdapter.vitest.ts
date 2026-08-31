/**
 * The adapter's generateTitle is the client half of thread naming. What is
 * pinned here is the paste case: a first message whose text travelled as an
 * attachment has no text part, and the old code returned before ever asking the
 * backend — leaving the thread unnamed for good.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from '../stores/chatStore';

import {
  createGrueneratorThreadListAdapter,
  getThreadAgentId,
  getThreadSlugSuffix,
  resolveThreadBySlugSuffix,
} from './GrueneratorThreadListAdapter';

import type { ChatApiClient } from '../context/ChatContext';
import type { ThreadMessage } from '@assistant-ui/react';

function makeApiClient(generateTitleResponse: unknown = {}) {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue(generateTitleResponse),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as unknown as ChatApiClient & {
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
}

function userMessage(content: unknown[]): ThreadMessage {
  return { role: 'user', content } as unknown as ThreadMessage;
}

/** Drain the stream so the adapter's async callback has finished. */
async function titleFrom(stream: Awaited<ReturnType<Adapter['generateTitle']>>): Promise<string> {
  let text = '';
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value as { type?: string; textDelta?: string };
    if (chunk.type === 'text-delta' && typeof chunk.textDelta === 'string') text += chunk.textDelta;
  }
  return text;
}

type Adapter = ReturnType<typeof createGrueneratorThreadListAdapter>;

describe('generateTitle', () => {
  it('asks the backend even when the first message carries no text', async () => {
    // Pasted text is sent as a file part (GrueneratorAttachmentAdapter), so the
    // user message has no text part at all.
    const apiClient = makeApiClient({ status: 'accepted', title: 'Haushalt 2027' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const title = await titleFrom(
      await adapter.generateTitle('thread-paste', [
        userMessage([{ type: 'file', data: 'ZmFrZQ==', mimeType: 'text/plain' }]),
      ])
    );

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/chat-service/threads/thread-paste/generate-title'
    );
    expect(title).toBe('Haushalt 2027');
  });

  it('shows the typed text at once but never writes a title itself', async () => {
    const apiClient = makeApiClient({ status: 'accepted', title: 'Pendlerpauschale' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const title = await titleFrom(
      await adapter.generateTitle('thread-typed', [
        userMessage([{ type: 'text', text: 'Wie hoch ist die Pendlerpauschale? Und ab wann?' }]),
      ])
    );

    expect(title).toBe('Wie hoch ist die Pendlerpauschale');
    // Generated titles have a single writer, the server. A PATCH from here looks
    // exactly like a manual rename to the server's conditional write and would
    // lock its own AI refinement out. Only `rename()` may PATCH.
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalledOnce();
  });

  it('survives a failing title endpoint without rejecting the stream', async () => {
    const apiClient = makeApiClient();
    apiClient.post = vi.fn().mockRejectedValue(new Error('boom'));
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const title = await titleFrom(
      await adapter.generateTitle('thread-broken', [
        userMessage([{ type: 'text', text: 'Kommunaler Klimaplan' }]),
      ])
    );

    expect(title).toBe('Kommunaler Klimaplan');
  });
});

describe('initialize', () => {
  const ROLE = { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle' };

  beforeEach(() => {
    useAgentStore.setState({
      currentThreadId: null,
      selectedAgentId: null,
      threadMode: 'eigener',
      customRoleRef: ROLE,
      customRoleName: ROLE.rolle,
      customSystemPrompt: null,
      roleRefSource: 'default',
    });
  });

  it('befördert die Standardrolle des Entwurfs zum frisch geminteten Thread', async () => {
    // Das Backend sendet `thread_created` nur für Threads, die es selbst
    // anlegt — der hier geminted Thread durchläuft `onThreadCreated` nie.
    // Ohne Promotion an dieser Stelle bekam ThreadDataSyncEffect für die
    // frischen Einstellungen eine 404 und räumte die noch als `default`
    // markierte Rolle beim ersten Senden wieder ab.
    const apiClient = makeApiClient({ id: 'thread-neu', slugSuffix: 'ab12cd' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    await adapter.initialize('__LOCALID_1');

    const state = useAgentStore.getState();
    expect(state.currentThreadId).toBe('thread-neu');
    expect(state.roleRefSource).toBe('load');
    expect(apiClient.patch).toHaveBeenCalledWith(
      '/api/chat-service/threads/thread-neu/settings',
      expect.objectContaining({ roleRef: ROLE })
    );
  });

  it('legt für einen rollenlosen Entwurf keine Einstellungszeile an', async () => {
    useAgentStore.setState({ threadMode: 'chat', customRoleRef: null, roleRefSource: 'load' });
    const apiClient = makeApiClient({ id: 'thread-ohne' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    await adapter.initialize('__LOCALID_2');

    expect(apiClient.patch).not.toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('räumt die Routing-Caches auf, damit der gelöschte Thread nicht re-resolvierbar ist', async () => {
    // GlitchTip #566, second leg: a deleted thread whose slug still sat in the
    // routing cache could be re-resolved by the routing effect, starting a
    // switch to the slot delete() just hid. delete() must drop every cache
    // entry for the remoteId.
    const apiClient = makeApiClient();
    const old = Date.now() - 3_600_000;
    apiClient.get = vi.fn().mockResolvedValue([
      {
        id: 'thread-loeschen',
        slugSuffix: 'zzdelt1',
        agentId: 'chat',
        title: 'Zum Löschen',
        status: 'archived',
        updatedAt: new Date(old).toISOString(),
        lastMessage: { content: 'x', role: 'user', created_at: new Date(old).toISOString() },
      },
    ]);
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    await adapter.list();
    expect(getThreadSlugSuffix('thread-loeschen')).toBe('zzdelt1');
    expect(resolveThreadBySlugSuffix('zzdelt1')).toBe('thread-loeschen');
    expect(getThreadAgentId('thread-loeschen')).toBe('chat');

    await adapter.delete('thread-loeschen');

    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/chat-service/threads?threadId=thread-loeschen'
    );
    expect(getThreadSlugSuffix('thread-loeschen')).toBeNull();
    expect(resolveThreadBySlugSuffix('zzdelt1')).toBeNull();
    expect(getThreadAgentId('thread-loeschen')).toBeNull();
  });
});
