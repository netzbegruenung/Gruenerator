/**
 * `cloud_files` gegen einen erfundenen Provider — kein Netz, keine Datenbank.
 *
 * Der Zuschnitt ist der Punkt: der Provider und die Wurzelliste kommen über
 * `ctx` herein, damit dieser Test jede Aktion durchspielen kann, ohne dass eine
 * Wolke oder eine Postgres-Instanz existiert.
 */
import { describe, expect, it, vi } from 'vitest';

import { NextcloudHttpError } from '../../../services/api-clients/nextcloudApiClient.js';
import { createSourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

import { makeCloudFilesTool, type AttachedNotebookFolder } from './cloudFileTools.js';

// `emitToolConfirmAction` legt die Karte in Redis ab. Ohne erreichbares Redis
// wirft der Client nicht, er antwortet nie — der Test lief auf der CI darum in
// den 5-s-Timeout, während er lokal (Redis läuft) grün war. Gemockt wird nur
// der Speicher: `emitToolConfirmAction` selbst bleibt echt, damit die
// Karte samt `CONFIRM_ACTION_CONFIG`-Eintrag weiter geprüft wird.
vi.mock('../services/pendingActionStore.js', () => ({
  pendingActionStore: { store: async () => {} },
}));

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { CloudFileProvider, CloudListing, CloudRoot } from '../../../services/files/index.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

/** Der Text, den der Schreiber im Quellenblock sieht. */
function sourceText(registered: unknown[], index = 0): string {
  const results = registered[index] as Array<{ content: string }>;
  return results.map((r) => r.content).join('\n');
}

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
  opts: {
    roots?: CloudRoot[];
    userId?: string | null;
    attachedWebpageUrls?: string[];
    folders?: AttachedNotebookFolder[];
    foldersThrow?: boolean;
    /** Der getippte Nachrichtentext — für Links, die NICHT angehängt sind. */
    userText?: string;
  } = {}
) {
  const notes: Array<[string, string]> = [];
  const registered: unknown[] = [];
  const registerOpts: unknown[] = [];
  const sseEvents: Array<[string, unknown]> = [];
  const sourceRegistry = {
    note: (title: string, content: string) => notes.push([title, content]),
    register: (results: unknown, o?: unknown) => {
      registered.push(results);
      registerOpts.push(o);
      return '[1] Auszug';
    },
  } as unknown as SourceRegistry;
  const sse = {
    send: (event: string, payload: unknown) => sseEvents.push([event, payload]),
  } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'user-1' : opts.userId },
    attachedWebpageUrls: opts.attachedWebpageUrls ?? [],
    ...(opts.userText ? { lastUserTextNoMentions: opts.userText } : {}),
  } as unknown as ChatGraphState;

  const tool = makeCloudFilesTool({
    state,
    sse,
    threadId: 'thread-1',
    sourceRegistry,
    provider: { id: 'nextcloud-share', ...provider } as CloudFileProvider,
    listRoots: async () => opts.roots ?? [ROOT],
    listNotebookFolders: async () => {
      if (opts.foldersThrow) throw new Error('qdrant weg');
      return opts.folders ?? [];
    },
  });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { recursive: false, ...args },
      {}
    )) ?? {};
  return { run, notes, registered, registerOpts, sseEvents, tool };
}

describe('list_connections', () => {
  it('names the connections and their host', async () => {
    const { run } = makeCtx({}, { roots: [ROOT, SECOND_ROOT] });
    const result = await run({ action: 'list_connections' });
    expect(result.connectionCount).toBe(2);
    expect(result.connections).toEqual([
      {
        connectionId: 'link-1',
        label: 'Anträge',
        host: 'wolke.netzbegruenung.de',
        origin: 'own',
        folders: [],
      },
      {
        connectionId: 'link-2',
        label: 'Presse',
        host: 'wolke.netzbegruenung.de',
        origin: 'own',
        folders: [],
      },
    ]);
  });

  /**
   * Der Kern der Reparatur (live 01.09.2026).
   *
   * Ging die Verbindungsliste über `note()`, landete sie im Prompt unter
   * „VORGÄNGE IN DIESEM TURN (… KEINE Quellen)" — und weil damit `freshSize` 0
   * blieb, bekam der Schreiber zusätzlich die Anweisung, er habe nicht
   * recherchiert und solle sagen, er müsse nachschlagen. Genau das tat er.
   */
  it('registers the connections as a source instead of a process note', async () => {
    const { run, notes, registered, registerOpts } = makeCtx({}, { roots: [ROOT] });
    await run({ action: 'list_connections' });
    expect(notes).toHaveLength(0);
    expect(registered).toHaveLength(1);
    expect(sourceText(registered)).toContain('Anträge');
    expect(sourceText(registered)).toContain('wolke.netzbegruenung.de');
    // Ohne angehobenes Mass schneidet die Registry bei 1500 Zeichen still ab.
    expect(registerOpts[0]).toEqual({ snippetChars: 4000 });
  });

  it('names the notebooks a folder is attached to, under the right connection', async () => {
    const { run, registered } = makeCtx(
      {},
      {
        roots: [ROOT, SECOND_ROOT],
        folders: [
          {
            shareLinkId: 'link-1',
            folderPath: 'Anträge/2026',
            folderName: '2026',
            notebook: 'Kreisverband',
            includeSubfolders: true,
          },
        ],
      }
    );
    const result = await run({ action: 'list_connections' });
    const connections = result.connections as Array<Record<string, unknown>>;
    expect(connections[0].folders).toEqual([
      {
        folderPath: 'Anträge/2026',
        folderName: '2026',
        notebook: 'Kreisverband',
        includeSubfolders: true,
      },
    ]);
    expect(connections[1].folders).toEqual([]);
    expect(sourceText(registered)).toContain('Kreisverband');
  });

  // Verbindungen liegen in Postgres, die Ordner in Qdrant. Fällt der eine
  // Speicher aus, bleibt „diese Verbindungen hast du" die richtige Antwort.
  it('still answers the connections when the notebook lookup fails', async () => {
    const { run, registered } = makeCtx({}, { roots: [ROOT], foldersThrow: true });
    const result = await run({ action: 'list_connections' });
    expect(result.connectionCount).toBe(1);
    expect(String(result.note)).toContain('nicht laden');
    expect(sourceText(registered)).toContain('Anträge');
  });

  // Die teuerste Ausfallform wäre eine erfundene Fehlanzeige. Ohne Verbindung
  // muss die Antwort sagen, dass keine da ist — und wie eine entsteht.
  it('says there is no connection instead of returning an empty list silently', async () => {
    const { run, registered } = makeCtx({}, { roots: [] });
    const result = await run({ action: 'list_connections' });
    expect(result.connectionCount).toBe(0);
    expect(String(result.note)).toContain('keine Wolke verbunden');
    // Eine Fehlanzeige ist kein Material: als Quelle eingetragen würde sie als
    // Recherche dieses Turns persistiert (siehe `sourceRegistry.note`).
    expect(registered).toHaveLength(0);
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

  // Der Pfad muss mit in die Quelle: ohne ihn kann der Schreiber den Ordner
  // benennen, aber nichts daraus zitieren und keinen Folgeaufruf vorbereiten.
  it('registers the entries with their paths as a source', async () => {
    const { run, notes, registered } = makeCtx({
      list: async () =>
        listing({
          entries: [entry('Reden', { isDirectory: true, isSupported: false }), entry('a.pdf')],
          folderCount: 1,
        }),
    });
    await run({ action: 'list', path: '' });
    expect(notes).toHaveLength(0);
    expect(sourceText(registered)).toContain('Reden/');
    expect(sourceText(registered)).toContain('a.pdf — a.pdf (2 KB)');
  });

  // Eine stumm abgeschnittene Liste sieht aus wie eine vollständige — deshalb
  // muss die Kürzungs-Notiz auch den Schreiber erreichen, nicht nur die Karte.
  it('carries the truncation note into the registered source', async () => {
    const { run, registered } = makeCtx({
      list: async () => listing({ entries: [entry('a.pdf')], truncated: true, depthLimited: true }),
    });
    await run({ action: 'list', recursive: true });
    expect(sourceText(registered)).toContain('unvollständig');
  });

  it('reports an empty folder as a note, not as a source', async () => {
    const { run, notes, registered } = makeCtx({ list: async () => listing() });
    await run({ action: 'list', path: 'Leer' });
    expect(registered).toHaveLength(0);
    expect(String(notes[0][1])).toContain('leer');
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

  it('registers the hits and reports a miss as a note', async () => {
    const hit = makeCtx({ find: async () => listing({ entries: [entry('Reden/x.pdf')] }) });
    await hit.run({ action: 'find', name: 'x' });
    expect(hit.notes).toHaveLength(0);
    expect(sourceText(hit.registered)).toContain('Reden/x.pdf');

    const miss = makeCtx({ find: async () => listing() });
    await miss.run({ action: 'find', name: 'x' });
    expect(miss.registered).toHaveLength(0);
    expect(String(miss.notes[0][1])).toContain('kein Treffer');
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

/**
 * Der Live-Ausfall vom 06.09.2026: `read` mit `path: 's/<token>'` lief mit dem
 * Token der GESPEICHERTEN Verbindung gegen einen fremden Share, der 401 kam
 * als nacktes „Request failed with status code 401" an, und weil der Fehler
 * nirgends geerdet war, erfand der Schreiber „ich kann keine externen Links
 * lesen". Diese Blöcke sichern alle drei Reparaturen.
 */
describe('share-URL path guard', () => {
  it('refuses a share-URL path on read without touching the provider', async () => {
    const read = vi.fn();
    const { run, notes } = makeCtx({ read });
    const result = await run({ action: 'read', path: 's/AbCdEf' });
    expect(String(result.error)).toContain('add_connection');
    expect(read).not.toHaveBeenCalled();
    expect(notes.some(([, content]) => content.includes('add_connection'))).toBe(true);
  });

  it('refuses a full share URL as a list path', async () => {
    const list = vi.fn();
    const { run } = makeCtx({ list });
    const result = await run({
      action: 'list',
      path: 'https://wolke.netzbegruenung.de/s/4oKeBG2t236tXTA',
    });
    expect(String(result.error)).toContain('Freigabe-Link');
    expect(list).not.toHaveBeenCalled();
  });

  it('still accepts an ordinary folder path', async () => {
    const list = vi.fn(async () => listing());
    const { run } = makeCtx({ list });
    const result = await run({ action: 'list', path: 'Anträge/2026' });
    expect(result.error).toBeUndefined();
    expect(list).toHaveBeenCalled();
  });
});

describe('error classification', () => {
  function failingRead(status: number) {
    return makeCtx({
      read: async () => {
        throw new NextcloudHttpError(`status ${status}`, status);
      },
    });
  }

  it('tells the model the connection itself is dead on 401, and grounds it', async () => {
    const { run, notes } = failingRead(401);
    const result = await run({ action: 'read', path: 'rede.pdf' });
    expect(String(result.error)).toContain('Einstellungen → Wolke');
    expect(result.errorCode).toBe('invalid_link');
    // Die Erdung ist der Halluzinations-Fix: ohne sie sieht der Schreiber im
    // split-Modus vom Fehlschlag NICHTS.
    expect(notes.some(([title]) => title === 'Wolke-Zugriff fehlgeschlagen')).toBe(true);
  });

  it('names the upload-only share on 405', async () => {
    const { run } = failingRead(405);
    const result = await run({ action: 'read', path: 'rede.pdf' });
    expect(String(result.error)).toContain('Nur anzeigen');
    expect(result.errorCode).toBe('file_drop');
  });

  it('points at the path, not the connection, on 404', async () => {
    const { run } = failingRead(404);
    const result = await run({ action: 'read', path: 'gibtsnicht.pdf' });
    expect(String(result.error)).toContain('action="list"');
    expect(result.errorCode).toBe('not_found');
  });

  it('keeps the raw message for unclassified failures', async () => {
    const { run, notes } = makeCtx({
      list: async () => {
        throw new Error('WebDAV 503');
      },
    });
    const result = await run({ action: 'list' });
    expect(String(result.error)).toContain('WebDAV 503');
    expect(result.errorCode).toBeUndefined();
    expect(notes).toHaveLength(1);
  });

  it('spells out the reason when testing a saved file-drop connection', async () => {
    const { run, notes } = makeCtx({
      test: async () => ({ ok: false, errorCode: 'file_drop' as const }),
    });
    const result = await run({ action: 'test_connection' });
    expect(result.ok).toBe(false);
    expect(String(result.note)).toContain('Nur anzeigen');
    expect(notes[0][1]).toContain('Nur anzeigen');
  });

  it('mentions expiry and password protection for an unusable link', async () => {
    const { run } = makeCtx({
      test: async () => ({ ok: false, errorCode: 'invalid_link' as const }),
    });
    const result = await run({ action: 'add_connection', link: 'https://w.example/s/Tot123' });
    expect(String(result.note)).toContain('passwortgeschützt');
    expect(String(result.note)).toContain('abgelaufen');
  });
});

describe('typed share links', () => {
  const TYPED = 'https://wolke.netzbegruenung.de/s/Getippt1';

  it('surfaces a link typed into the message text, like an attached one', async () => {
    const { tool } = makeCtx({}, { userText: `kannst du den link auslesen ${TYPED}` });
    expect(tool.description).toContain(TYPED);
  });

  it('uses the typed link for test_connection when the model names none', async () => {
    const test = vi.fn(async () => ({ ok: true, entryCount: 2 }));
    const { run } = makeCtx({ test }, { userText: `bitte prüfen: ${TYPED}` });
    await run({ action: 'test_connection' });
    expect(test).toHaveBeenCalledWith({ link: TYPED });
  });

  it('does not duplicate a link that is both attached and typed', async () => {
    const { tool } = makeCtx({}, { userText: `siehe ${TYPED}`, attachedWebpageUrls: [TYPED] });
    expect(tool.description.split(TYPED).length - 1).toBe(1);
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

  // `connectionId` meint eine gespeicherte Verbindung — ein angehängter Link
  // darf da nicht dazwischenfahren, sonst prüft das Werkzeug etwas anderes,
  // als das Modell benannt hat.
  it('keeps a named connection even when a link is attached', async () => {
    const test = vi.fn(async () => ({ ok: true, entryCount: 1 }));
    const { run } = makeCtx(
      { test },
      {
        roots: [ROOT, SECOND_ROOT],
        attachedWebpageUrls: ['https://wolke.netzbegruenung.de/s/Angehaengt'],
      }
    );
    await run({ action: 'test_connection', connectionId: 'link-2' });
    expect(test).toHaveBeenCalledWith(SECOND_ROOT);
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

  // Über `@link` angehängte Links stehen NICHT im Nachrichtentext — ohne diese
  // beiden Stücke (Beschreibung + Rückfall) wäre ein so angehängter
  // Freigabe-Link seit dem `scrape_url`-Ausschluss ein stiller Blindgänger.
  it('takes an @link-attached share link when the model names none', async () => {
    const test = vi.fn(async () => ({ ok: true, entryCount: 3 }));
    const { run, tool, sseEvents } = makeCtx(
      { test },
      { attachedWebpageUrls: ['https://wolke.netzbegruenung.de/s/Angehaengt'] }
    );

    expect(tool.description).toContain('https://wolke.netzbegruenung.de/s/Angehaengt');

    const result = await run({ action: 'add_connection' });
    expect(test).toHaveBeenCalledWith({
      link: 'https://wolke.netzbegruenung.de/s/Angehaengt',
    });
    expect(result.needsConfirmation).toBe(true);
    expect(sseEvents[0][0]).toBe('confirm_action');
  });

  it('does not mention an attachment that is not a share link', async () => {
    const { tool } = makeCtx({}, { attachedWebpageUrls: ['https://gruene.de/programm'] });
    expect(tool.description).not.toContain('gruene.de');
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

/**
 * Gegen die ECHTE Registry, nicht gegen die Attrappe oben.
 *
 * Das ist die eigentliche Behauptung der Reparatur, und sie hängt an zwei
 * Dingen, die eine Attrappe bauartbedingt nicht zeigt: wo `renderAll()` den
 * Text hinschreibt, und was `freshSize` danach sagt. Beides entscheidet in
 * `buildSynthSystem`, ob der Schreiber die Anweisung bekommt, er habe nicht
 * recherchiert und solle sagen, er müsse nachschlagen (`carriedOnly`).
 */
describe('was der Schreiber im split-Modus wirklich sieht', () => {
  const withRealRegistry = (roots: CloudRoot[]) => {
    const sourceRegistry = createSourceRegistry();
    const tool = makeCloudFilesTool({
      state: {
        agentConfig: { userId: 'user-1' },
        attachedWebpageUrls: [],
      } as unknown as ChatGraphState,
      sse: { send: () => {} } as unknown as SSEWriter,
      threadId: 'thread-1',
      sourceRegistry,
      provider: { id: 'nextcloud-share' } as CloudFileProvider,
      listRoots: async () => roots,
      listNotebookFolders: async () => [],
    });
    const run = async (args: Record<string, unknown>) =>
      (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
        { recursive: false, ...args },
        {}
      );
    return { run, sourceRegistry };
  };

  it('puts a connection into the citable sources, not into the VORGÄNGE block', async () => {
    const { run, sourceRegistry } = withRealRegistry([ROOT]);
    await run({ action: 'list_connections' });

    // freshSize > 0 ist der Schalter: er nimmt `carriedOnly` in
    // `synthPrompt.ts` die Grundlage — also die Anweisung, sich für unwissend
    // zu erklären, die die Live-Antwort vom 01.09.2026 wörtlich befolgt hat.
    expect(sourceRegistry.freshSize).toBe(1);
    const block = sourceRegistry.renderAll();
    expect(block).toContain('Anträge');
    expect(block).not.toContain('VORGÄNGE IN DIESEM TURN');
  });

  it('keeps a missing connection in the VORGÄNGE block and out of the sources', async () => {
    const { run, sourceRegistry } = withRealRegistry([]);
    await run({ action: 'list_connections' });

    expect(sourceRegistry.freshSize).toBe(0);
    expect(sourceRegistry.renderAll()).toContain('VORGÄNGE IN DIESEM TURN');
  });
});
