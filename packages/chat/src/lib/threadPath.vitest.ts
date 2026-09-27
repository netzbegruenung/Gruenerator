import { describe, expect, it, vi } from 'vitest';

import { createGrueneratorThreadListAdapter } from '../runtime/GrueneratorThreadListAdapter';

import { buildNotebookThreadPath, pathNamesThread } from './threadPath';

import type { ChatApiClient } from '../context/ChatContext';

// A notebook thread row links to its notebook page and carries the thread id in
// the query. The earlier targets (`/gruene-…`, `/notebook/…`) went through
// redirects that dropped the query string, so the id never arrived and every
// notebook conversation opened as a blank start page.
describe('buildNotebookThreadPath', () => {
  it('sends a system collection to its notebook page', () => {
    expect(buildNotebookThreadPath('bayern-system', 't1')).toBe('/notebooks/bayern?thread=t1');
  });

  it('sends a user notebook to the same route, keyed by its id', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(buildNotebookThreadPath(id, 't1')).toBe(`/notebooks/${id}?thread=t1`);
  });

  // The page slug is `oesterreich`, the collection `oesterreich-gruene-system`.
  // Stripping the suffix therefore yields a path no route defines on its own —
  // NotebookResolver resolves it by looking the collection up.
  it('keeps the collection name when it differs from the page slug', () => {
    expect(buildNotebookThreadPath('oesterreich-gruene-system', 't1')).toBe(
      '/notebooks/oesterreich-gruene?thread=t1'
    );
  });

  it('strips only a trailing -system, not one inside the name', () => {
    expect(buildNotebookThreadPath('system-wandel-system', 't1')).toBe(
      '/notebooks/system-wandel?thread=t1'
    );
  });
});

// The delete guard in ThreadListItem asks whether the URL still names the
// clicked thread. The answer must not depend on the title half of the slug: a
// rename replaces the URL a tick later, and legacy links carry the bare id.
describe('pathNamesThread', () => {
  const remoteId = '10e6ccc2-5ec2-4800-a5b6-6db04eabdc07';

  async function seedSlugCache() {
    const apiClient = {
      get: vi.fn().mockResolvedValue([
        {
          id: remoteId,
          slugSuffix: 'scQqEC',
          agentId: 'chat',
          title: 'Reformprozess Ortsverband',
          status: 'regular',
          updatedAt: new Date().toISOString(),
          lastMessage: { content: 'x', role: 'user', created_at: new Date().toISOString() },
        },
      ]),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as ChatApiClient;
    await createGrueneratorThreadListAdapter(apiClient, 'chat').list();
  }

  it('matches the canonical slug and a slug whose title half is stale', async () => {
    await seedSlugCache();
    expect(pathNamesThread('/chat/reformprozess-ortsverband-scQqEC', remoteId)).toBe(true);
    expect(pathNamesThread('/chat/bitte-schreibe-mir-eine-pressemitteilung-scQqEC', remoteId)).toBe(
      true
    );
  });

  it('matches a legacy link carrying the bare remote id', async () => {
    await seedSlugCache();
    expect(pathNamesThread(`/chat/${remoteId}`, remoteId)).toBe(true);
  });

  it('rejects other threads, bare /chat and a missing path', async () => {
    await seedSlugCache();
    expect(pathNamesThread('/chat/anderer-thread-zzzzzz', remoteId)).toBe(false);
    expect(pathNamesThread('/chat', remoteId)).toBe(false);
    expect(pathNamesThread(null, remoteId)).toBe(false);
    expect(pathNamesThread(undefined, remoteId)).toBe(false);
  });

  it('never matches a thread whose suffix is unknown', () => {
    expect(pathNamesThread('/chat/irgendwas-abcdef', 'unbekannt')).toBe(false);
  });
});
