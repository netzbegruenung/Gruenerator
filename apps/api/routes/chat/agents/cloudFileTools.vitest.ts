/**
 * `cloud_files` gegen einen erfundenen Provider — kein Netz, keine Datenbank.
 *
 * Der Zuschnitt ist der Punkt: der Provider und die Wurzelliste kommen über
 * `ctx` herein, damit dieser Test jede Aktion durchspielen kann, ohne dass eine
 * Wolke oder eine Postgres-Instanz existiert.
 */
import { describe, expect, it, vi } from 'vitest';

import { makeCloudFilesTool } from './cloudFileTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { CloudFileProvider, CloudListing, CloudRoot } from '../../../services/files/index.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

const ROOT: CloudRoot = {
  connectionId: 'link-1',
  providerId: 'nextcloud-share',
  label: 'Anträge',
  host: 'wolke.netzbegruenung.de',
  origin: 'own',
  isActive: true,
  secret: 'https://wolke.netzbegruenung.de/s/AbCdEf',
};

const SECOND_ROOT: CloudRoot = {
  ...ROOT,
  connectionId: 'link-2',
  label: 'Presse',
  secret: 'https://wolke.netzbegruenung.de/s/ZyXwVu',
};

function listing(partial: Partial<CloudListing> = {}): CloudListing {
  return { entries: [], folderCount: 0, depthLimited: false, truncated: false, ...partial };
}

function entry(name: string, over: Partial<CloudListing['entries'][number]> = {}) {
  return {
    path: name,
    name: name.split('/').pop() ?? name,
    isDirectory: false,
    size: 2048,
    mimeType: null,
    lastModified: null,
    etag: 'e1',
    isSupported: true,
    ...over,
  };
}

function makeCtx(
  provider: Partial<CloudFileProvider>,
  opts: { roots?: CloudRoot[]; userId?: string | null } = {}
) {
  const notes: Array<[string, string]> = [];
  const registered: unknown[] = [];
  const sseEvents: Array<[string, unknown]> = [];
  const sourceRegistry = {
    note: (title: string, content: string) => notes.push([title, content]),
    register: (results: unknown) => {
      registered.push(results);
      return '[1] Auszug';
    },
  } as unknown as SourceRegistry;
  const sse = {
    send: (event: string, payload: unknown) => sseEvents.push([event, payload]),
  } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'user-1' : opts.userId },
  } as unknown as ChatGraphState;

  const tool = makeCloudFilesTool({
    state,
    sse,
    threadId: 'thread-1',
    sourceRegistry,
    provider: { id: 'nextcloud-share', ...provider } as CloudFileProvider,
    listRoots: async () => opts.roots ?? [ROOT],
  });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { recursive: false, ...args },
      {}
    )) ?? {};
  return { run, notes, registered, sseEvents };
}

describe('list_connections', () => {
  it('names the connections and their host', async () => {
    const { run, notes } = makeCtx({}, { roots: [ROOT, SECOND_ROOT] });
    const result = await run({ action: 'list_connections' });
    expect(result.connectionCount).toBe(2);
    expect(result.connections).toEqual([
      {
        connectionId: 'link-1',
        label: 'Anträge',
        host: 'wolke.netzbegruenung.de',
        origin: 'own',
      },
      {
        connectionId: 'link-2',
        label: 'Presse',
        host: 'wolke.netzbegruenung.de',
        origin: 'own',
      },
    ]);
    expect(notes[0][0]).toBe('Wolke-Verbindungen');
  });

  // Die teuerste Ausfallform wäre eine erfundene Fehlanzeige. Ohne Verbindung
  // muss die Antwort sagen, dass keine da ist — und wie eine entsteht.
  it('says there is no connection instead of returning an empty list silently', async () => {
    const { run } = makeCtx({}, { roots: [] });
    const result = await run({ action: 'list_connections' });
    expect(result.connectionCount).toBe(0);
    expect(String(result.note)).toContain('keine Wolke verbunden');
  });

  it('refuses without a signed-in person', async () => {
    const { run } = makeCtx({}, { userId: null });
    expect(String((await run({ action: 'list_connections' })).error)).toContain('Nutzer-Sitzung');
  });
});

describe('list', () => {
  it('renders a folder listing with paths the model can pass back', async () => {
    const { run } = makeCtx({
      list: async () =>
        listing({
          entries: [entry('Reden', { isDirectory: true, isSupported: false }), entry('a.pdf')],
          folderCount: 1,
        }),
    });
    const result = await run({ action: 'list', path: '' });
    expect(result.connection).toBe('Anträge');
    expect(result.entries).toEqual([
      { path: 'Reden', name: 'Reden', isDirectory: true, readable: false, info: 'Ordner' },
      { path: 'a.pdf', name: 'a.pdf', isDirectory: false, readable: true, info: '2 KB' },
    ]);
  });

  it('states truncation and depth limits rather than looking complete', async () => {
    const { run } = makeCtx({
      list: async () => listing({ entries: [entry('a.pdf')], truncated: true, depthLimited: true }),
    });
    const note = String((await run({ action: 'list', recursive: true })).note);
    expect(note).toContain('unvollständig');
    expect(note).toContain('Unterordner');
  });

  it('asks for a connectionId when there is more than one connection', async () => {
    const { run } = makeCtx({ list: async () => listing() }, { roots: [ROOT, SECOND_ROOT] });
    const result = await run({ action: 'list' });
    expect(String(result.error)).toContain('connectionId');
    expect(String(result.error)).toContain('link-2');
  });

  it('turns a provider failure into an error the loop can read', async () => {
    const { run } = makeCtx({
      list: async () => {
        throw new Error('WebDAV 503');
      },
    });
    expect(String((await run({ action: 'list' })).error)).toContain('WebDAV 503');
  });
});

describe('find', () => {
  it('passes name and extensions through to the provider', async () => {
    const find = vi.fn(async () => listing({ entries: [entry('Reden/x.pdf')] }));
    const { run } = makeCtx({ find });
    const result = await run({ action: 'find', name: 'x', extensions: ['pdf'] });
    expect(find).toHaveBeenCalledWith(ROOT, { name: 'x', extensions: ['pdf'] });
    expect(result.entryCount).toBe(1);
  });

  it('needs something to search for', async () => {
    const { run } = makeCtx({ find: async () => listing() });
    expect(String((await run({ action: 'find' })).error)).toContain('name');
  });
});

describe('read', () => {
  it('grounds the text in the source registry and returns the lean shape', async () => {
    const { run, registered } = makeCtx({
      read: async () => ({
        buffer: Buffer.from('Ein Antrag über Windkraft.'),
        mimeType: 'text/plain',
        size: 26,
      }),
    });
    const result = await run({ action: 'read', path: 'Reden/rede.txt' });
    expect(result.file).toBe('rede.txt');
    expect(result.sources).toBe('[1] Auszug');
    // Der Rohtext geht in die Registry, nicht in den Modellkontext.
    expect(JSON.stringify(result)).not.toContain('Windkraft');
    expect(registered).toHaveLength(1);
  });

  it('says so when nothing readable came out', async () => {
    const { run } = makeCtx({
      read: async () => ({ buffer: Buffer.from(''), mimeType: 'text/plain', size: 0 }),
    });
    const result = await run({ action: 'read', path: 'leer.txt' });
    expect(String(result.error)).toContain('kein Text');
  });

  it('needs a path', async () => {
    const { run } = makeCtx({
      read: async () => ({ buffer: Buffer.from(''), mimeType: null, size: 0 }),
    });
    expect(String((await run({ action: 'read' })).error)).toContain('path');
  });
});

describe('test_connection', () => {
  it('checks a raw link that is not saved yet', async () => {
    const test = vi.fn(async () => ({ ok: true, entryCount: 3 }));
    const { run } = makeCtx({ test });
    const result = await run({ action: 'test_connection', link: 'https://w.example/s/Tok123' });
    expect(test).toHaveBeenCalledWith({ link: 'https://w.example/s/Tok123' });
    expect(result.ok).toBe(true);
    expect(String(result.note)).toContain('3 Einträge');
  });

  it('checks a saved connection when no link is given', async () => {
    const test = vi.fn(async () => ({ ok: false, errorCode: 'forbidden' as const }));
    const { run } = makeCtx({ test });
    const result = await run({ action: 'test_connection' });
    expect(test).toHaveBeenCalledWith(ROOT);
    expect(result.ok).toBe(false);
  });
});

describe('add_connection', () => {
  it('tests first, then asks — and creates nothing on its own', async () => {
    const test = vi.fn(async () => ({ ok: true, entryCount: 7 }));
    const { run, sseEvents } = makeCtx({ test });
    const result = await run({
      action: 'add_connection',
      link: 'https://wolke.netzbegruenung.de/s/NewTok',
      label: 'Kreisverband',
    });

    expect(test).toHaveBeenCalledWith({ link: 'https://wolke.netzbegruenung.de/s/NewTok' });
    expect(result.needsConfirmation).toBe(true);

    const [event, payload] = sseEvents[0];
    expect(event).toBe('confirm_action');
    const card = payload as { type: string; metadata: Array<{ key: string; value: string }> };
    expect(card.type).toBe('add_cloud_connection');
    // Die Karte muss zeigen, was freigegeben wird — sonst ist die Zustimmung blind.
    expect(card.metadata).toContainEqual({ key: 'Wolke', value: 'wolke.netzbegruenung.de' });
    expect(card.metadata).toContainEqual({
      key: 'Inhalt',
      value: '7 Einträge im Wurzelordner',
    });
    expect(card.metadata).toContainEqual({ key: 'Zugriff', value: 'nur lesend' });
  });

  it('does not ask when the link does not work', async () => {
    const { run, sseEvents } = makeCtx({
      test: async () => ({ ok: false, errorCode: 'not_found' as const }),
    });
    const result = await run({ action: 'add_connection', link: 'https://w.example/s/Dead' });
    expect(result.ok).toBe(false);
    expect(sseEvents).toHaveLength(0);
  });

  it('rejects something that is not a URL before touching the network', async () => {
    const test = vi.fn();
    const { run } = makeCtx({ test });
    expect(String((await run({ action: 'add_connection', link: 'wolke/s/x' })).error)).toContain(
      'URL'
    );
    expect(test).not.toHaveBeenCalled();
  });
});
