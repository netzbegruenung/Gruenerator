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
  THREAD_LIST_PAGE_SIZE,
  getThreadAgentId,
  getThreadSlugSuffix,
  isThreadCollaborative,
  lookupThreadBySlugSuffix,
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

    // 33 characters, one past the sidebar budget — cut on the word boundary,
    // then the stranded article goes too.
    expect(title).toBe('Wie hoch ist');
    // Generated titles have a single writer, the server. A PATCH from here looks
    // exactly like a manual rename to the server's conditional write and would
    // lock its own AI refinement out. Only `rename()` may PATCH.
    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalledOnce();
  });

  it('clamps the optimistic title to the sidebar budget, without an ellipsis (#3411)', async () => {
    // The row ellipsizes itself (CSS `truncate` on web, `numberOfLines` on
    // native), so a literal "..." either sat past the cut or doubled it. The
    // clamp is `clampThreadTitle` from @gruenerator/shared — the same one the
    // server writes with, so the optimistic title cannot drift from it.
    const apiClient = makeApiClient({ status: 'accepted', title: 'Radinfrastruktur' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const title = await titleFrom(
      await adapter.generateTitle('thread-long', [
        userMessage([
          { type: 'text', text: 'Antrag zur Radinfrastruktur in der Innenstadt vorbereiten' },
        ]),
      ])
    );

    expect(title).toBe('Antrag zur Radinfrastruktur');
    expect(title).not.toContain('...');
  });

  it("names the thread after a mention token's label, never its id", async () => {
    const apiClient = makeApiClient({ status: 'accepted', title: 'Busse auf dem Land' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const title = await titleFrom(
      await adapter.generateTitle('thread-vorlage', [
        userMessage([{ type: 'text', text: '@[Zitat mit Foto](vorlage:alt-zitat) Busse' }]),
      ])
    );

    expect(title).toBe('@Zitat mit Foto Busse');
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

  it('sends teamShared and opens live sync for the creator right away', async () => {
    useAgentStore.setState({ threadMode: 'chat', customRoleRef: null, roleRefSource: 'load' });
    useAgentStore.getState().setPendingGroup('g1', true);
    const apiClient = makeApiClient({ id: 'thread-team' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    await adapter.initialize('__LOCALID_3');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/chat-service/threads',
      expect.objectContaining({ groupId: 'g1', teamShared: true })
    );
    expect(isThreadCollaborative('thread-team')).toBe(true);
  });

  it('keeps a private project chat private', async () => {
    useAgentStore.setState({ threadMode: 'chat', customRoleRef: null, roleRefSource: 'load' });
    useAgentStore.getState().setPendingGroup('g1', false);
    const apiClient = makeApiClient({ id: 'thread-priv' });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    await adapter.initialize('__LOCALID_4');

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/chat-service/threads',
      expect.not.objectContaining({ teamShared: true })
    );
    expect(isThreadCollaborative('thread-priv')).toBe(false);
  });
});

describe('isThreadCollaborative for owners (regression: presence before team chats)', () => {
  const t = (id: string, extra: Record<string, unknown>) => ({
    id,
    agentId: 'chat',
    title: id,
    status: 'regular',
    updatedAt: new Date().toISOString(),
    accessType: 'owner',
    ...extra,
  });

  it('an own thread is collaborative when shared with anyone, not when private', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi
      .fn()
      .mockResolvedValue([
        t('own-private', { shared: false }),
        t('own-shared', { shared: true }),
        t('own-old-server', {}),
        t('own-team', { teamShared: true }),
        t('theirs', { accessType: 'shared' }),
      ]);
    await createGrueneratorThreadListAdapter(apiClient, 'chat').list();

    expect(isThreadCollaborative('own-private')).toBe(false);
    expect(isThreadCollaborative('own-old-server')).toBe(false);
    expect(isThreadCollaborative('own-shared')).toBe(true);
    expect(isThreadCollaborative('own-team')).toBe(true);
    expect(isThreadCollaborative('theirs')).toBe(true);
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

  async function deleteListedThread(response: unknown) {
    const apiClient = makeApiClient();
    const old = new Date(Date.now() - 3_600_000).toISOString();
    apiClient.get = vi.fn().mockResolvedValue([
      {
        id: 'thread-papierkorb',
        agentId: 'chat',
        title: 'Haushaltsrede',
        status: 'archived',
        updatedAt: old,
        lastMessage: { content: 'x', role: 'user', created_at: old },
      },
    ]);
    apiClient.delete = vi.fn().mockResolvedValue(response);
    const onTrashed = vi.fn();
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat', { onTrashed });
    await adapter.list();
    await adapter.delete('thread-papierkorb');
    return onTrashed;
  }

  it('reicht den gecachten Titel an onTrashed, wenn der Thread im Papierkorb liegt', async () => {
    const onTrashed = await deleteListedThread({ success: true, trashed: true });
    expect(onTrashed).toHaveBeenCalledWith('thread-papierkorb', 'Haushaltsrede');
  });

  it('meldet nichts, wenn der Server den Thread endgültig entfernt hat (leer oder Doc-Chat)', async () => {
    expect(await deleteListedThread({ success: true, trashed: false })).not.toHaveBeenCalled();
    // An older backend answers without the flag — no undo it could not honour.
    expect(await deleteListedThread({ success: true })).not.toHaveBeenCalled();
    expect(await deleteListedThread(null)).not.toHaveBeenCalled();
  });
});

describe('list — empty-thread cleanup', () => {
  it('asks the server to delete only if the thread is still empty (#5465)', async () => {
    // The list can predate a thread's first message; only the DELETE itself
    // can check emptiness, so a user's delete and the cleanup must differ.
    const apiClient = makeApiClient();
    const old = (ms: number) => new Date(Date.now() - ms).toISOString();
    apiClient.get = vi.fn().mockResolvedValue([
      { id: 'leer-neu', agentId: 'chat', title: null, updatedAt: old(120_000), lastMessage: null },
      {
        id: 'leer-alt',
        agentId: 'chat',
        title: null,
        updatedAt: old(3_600_000),
        lastMessage: null,
      },
    ]);
    useAgentStore.setState({ currentThreadId: null });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    await adapter.list();

    expect(apiClient.delete).toHaveBeenCalledTimes(1);
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/chat-service/threads?threadId=leer-alt&onlyIfEmpty=true'
    );
  });
});

describe('list — paging (#5987)', () => {
  const iso = (n: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, 0) - n * 60_000).toISOString();
  const thread = (n: number, extra: Record<string, unknown> = {}) => ({
    id: `page-t-${n}`,
    agentId: 'chat',
    title: `T${n}`,
    status: 'regular',
    updatedAt: iso(n),
    lastMessage: { content: 'x', role: 'user', created_at: iso(n) },
    ...extra,
  });
  const page = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => thread(from + i));

  it('asks for one page and hands back a cursor when the page is full', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi.fn().mockResolvedValue(page(0, THREAD_LIST_PAGE_SIZE));
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const res = await adapter.list();

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/chat-service/threads?limit=${THREAD_LIST_PAGE_SIZE}`
    );
    expect(res.threads).toHaveLength(THREAD_LIST_PAGE_SIZE);
    const last = THREAD_LIST_PAGE_SIZE - 1;
    expect(res.nextCursor).toBe(`${iso(last)}|page-t-${last}`);
  });

  it('loadMore sends the cursor and a short last page ends the list', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi
      .fn()
      .mockResolvedValueOnce(page(0, THREAD_LIST_PAGE_SIZE))
      .mockResolvedValueOnce(page(THREAD_LIST_PAGE_SIZE, 3));
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const first = await adapter.list();
    const second = await adapter.list({ after: first.nextCursor });

    const url = (apiClient.get as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
    expect(url).toContain(`before=${encodeURIComponent(first.nextCursor as string)}`);
    expect(second.threads).toHaveLength(3);
    expect(second.nextCursor).toBeUndefined();
  });

  it('an older server that ignores limit and sends everything does not page on', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi.fn().mockResolvedValue(page(0, THREAD_LIST_PAGE_SIZE + 20));
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    expect((await adapter.list()).nextCursor).toBeUndefined();
  });

  it('lists external threads on the first page only', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi.fn().mockResolvedValue(page(0, THREAD_LIST_PAGE_SIZE));
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat', {
      getExternalThreads: () => [
        { remoteId: 'ext-1', externalId: 'e1', title: 'Notebook', updatedAt: iso(500) },
      ],
    } as never);

    const first = await adapter.list();
    const second = await adapter.list({ after: first.nextCursor });

    expect(first.threads.some((t) => t.remoteId === 'ext-1')).toBe(true);
    expect(second.threads.some((t) => t.remoteId === 'ext-1')).toBe(false);
  });

  it('keeps only the newest empty thread across pages', async () => {
    const apiClient = makeApiClient();
    const empty = (n: number) => thread(n, { lastMessage: null, updatedAt: iso(120 + n) });
    apiClient.get = vi
      .fn()
      .mockResolvedValueOnce([...page(0, THREAD_LIST_PAGE_SIZE - 1), empty(900)])
      .mockResolvedValueOnce([empty(901), thread(902)]);
    useAgentStore.setState({ currentThreadId: null });
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const first = await adapter.list();
    expect(apiClient.delete).not.toHaveBeenCalled();
    await adapter.list({ after: first.nextCursor });

    expect(apiClient.delete).toHaveBeenCalledTimes(1);
    expect(apiClient.delete).toHaveBeenCalledWith(
      '/api/chat-service/threads?threadId=page-t-901&onlyIfEmpty=true'
    );
  });
});

describe('fetch — a thread outside the loaded page', () => {
  it('looks the thread up by id instead of downloading the list', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi.fn().mockResolvedValue([
      {
        id: 'old-thread',
        slugSuffix: 'oldsl1',
        agentId: 'chat',
        title: 'Alt',
        status: 'regular',
        threadType: 'chat',
        updatedAt: new Date().toISOString(),
      },
    ]);
    const adapter = createGrueneratorThreadListAdapter(apiClient, 'chat');

    const res = await adapter.fetch('old-thread');

    expect(apiClient.get).toHaveBeenCalledWith('/api/chat-service/threads?threadId=old-thread');
    expect(res).toMatchObject({ remoteId: 'old-thread', title: 'Alt', status: 'regular' });
    expect(resolveThreadBySlugSuffix('oldsl1')).toBe('old-thread');
  });

  it('resolves a slug that is not in the loaded pages with a one-thread lookup', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi
      .fn()
      .mockResolvedValue([
        { id: 'slug-thread', slugSuffix: 'sLuGxx', agentId: 'chat', title: 'S', status: 'regular' },
      ]);
    createGrueneratorThreadListAdapter(apiClient, 'chat');

    expect(resolveThreadBySlugSuffix('sLuGxx')).toBeNull();
    expect(await lookupThreadBySlugSuffix('sLuGxx')).toBe('slug-thread');
    expect(apiClient.get).toHaveBeenCalledWith('/api/chat-service/threads?slugSuffix=sLuGxx');
    expect(resolveThreadBySlugSuffix('sLuGxx')).toBe('slug-thread');
  });

  it('rejects when the server has no such thread for this user', async () => {
    const apiClient = makeApiClient();
    apiClient.get = vi.fn().mockResolvedValue([]);
    await expect(
      createGrueneratorThreadListAdapter(apiClient, 'chat').fetch('nope')
    ).rejects.toThrow('not found');
  });
});
