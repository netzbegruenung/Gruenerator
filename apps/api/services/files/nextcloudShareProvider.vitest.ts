/**
 * Der Provider gegen ein erfundenes WebDAV — kein Netz, keine Datenbank.
 *
 * Der wichtigste Test ist der letzte: das Interface hat keine Schreibmethoden,
 * und der Client darf auch keine Schreib-Verben absetzen. Beides zusammen ist
 * die Zusicherung „der Grünerator schreibt nichts in deine Wolke", auf die sich
 * die Datenschutz-Auskunft beruft.
 */
import { describe, expect, it, vi } from 'vitest';

import { NextcloudShareProvider, hrefToRootRelativePath } from './nextcloudShareProvider.js';

import type NextcloudApiClient from '../api-clients/nextcloudApiClient.js';
import type { NextcloudFile } from '../api-clients/nextcloudApiClient.js';
import type { CloudRoot } from './types.js';

const PREFIX = '/public.php/webdav';

function file(path: string, opts: Partial<NextcloudFile> = {}): NextcloudFile {
  const segments = path.split('/').filter(Boolean);
  return {
    href: `${PREFIX}/${segments.map(encodeURIComponent).join('/')}`,
    name: segments[segments.length - 1] ?? '',
    size: 1234,
    lastModified: new Date('2026-08-01T10:00:00Z'),
    etag: 'abc123',
    isDirectory: false,
    ...opts,
  };
}

function dir(path: string): NextcloudFile {
  return file(path, { isDirectory: true, size: null, etag: null });
}

/** `tree[folderPath]` = was ein PROPFIND Depth:1 auf diesen Ordner liefert. */
function fakeClient(tree: Record<string, NextcloudFile[]>, calls: string[] = []) {
  return {
    listFolder: vi.fn(async (folderPath?: string) => {
      calls.push(`PROPFIND ${folderPath ?? ''}`);
      return tree[folderPath ?? ''] ?? [];
    }),
    downloadFile: vi.fn(async (path: string) => {
      calls.push(`GET ${path}`);
      return { buffer: Buffer.from('hello'), mimeType: 'text/plain', size: 5 };
    }),
    testConnection: vi.fn(async () => ({ success: true, message: 'ok' })),
  } as unknown as NextcloudApiClient;
}

function makeProvider(client: NextcloudApiClient, links = [ownLink]) {
  return new NextcloudShareProvider({
    listOwnLinks: async () => links,
    listSharedLinks: async () => [],
    createClient: async () => client,
  });
}

const ownLink = {
  id: 'link-1',
  share_link: 'https://wolke.netzbegruenung.de/s/AbCdEf',
  label: 'Anträge',
  is_active: true,
};

const root: CloudRoot = {
  connectionId: 'link-1',
  providerId: 'nextcloud-share',
  label: 'Anträge',
  host: 'wolke.netzbegruenung.de',
  origin: 'own',
  isActive: true,
  secret: ownLink.share_link,
};

describe('hrefToRootRelativePath', () => {
  it('decodes percent-encoded segments and drops the webdav prefix', () => {
    expect(hrefToRootRelativePath(`${PREFIX}/Wahlpr%C3%BCfsteine/rede.pdf`)).toBe(
      'Wahlprüfsteine/rede.pdf'
    );
  });

  it('trims the trailing slash a collection href carries', () => {
    expect(hrefToRootRelativePath(`${PREFIX}/Antr%C3%A4ge/`)).toBe('Anträge');
  });

  it('survives a malformed escape sequence instead of throwing', () => {
    expect(hrefToRootRelativePath(`${PREFIX}/100%betreuung/x.pdf`)).toBe('100%betreuung/x.pdf');
  });
});

describe('listRoots', () => {
  it('turns share links into roots and never leaks the link into a visible field', async () => {
    const provider = makeProvider(fakeClient({}));
    const [first] = await provider.listRoots('user-1');
    expect(first.connectionId).toBe('link-1');
    expect(first.label).toBe('Anträge');
    expect(first.host).toBe('wolke.netzbegruenung.de');
    expect(first.origin).toBe('own');
    // Das Token lebt nur im `secret`, das der Aufrufer nicht anzeigt.
    expect(JSON.stringify({ ...first, secret: undefined })).not.toContain('AbCdEf');
  });

  it('lists a group-shared link once, even when it is also an own link', async () => {
    const provider = new NextcloudShareProvider({
      listOwnLinks: async () => [ownLink],
      listSharedLinks: async () => [
        { link: ownLink, groupName: 'KV Musterstadt', sharedByName: 'Alex' },
        {
          link: { ...ownLink, id: 'link-2', label: 'Presse' },
          groupName: 'KV Musterstadt',
          sharedByName: 'Alex',
        },
      ],
      createClient: async () => fakeClient({}),
    });
    const roots = await provider.listRoots('user-1');
    expect(roots.map((r) => r.connectionId)).toEqual(['link-1', 'link-2']);
    expect(roots[1].sharedVia).toEqual({ groupName: 'KV Musterstadt', sharedByName: 'Alex' });
  });

  it('degrades to the reachable half when one source fails', async () => {
    const provider = new NextcloudShareProvider({
      listOwnLinks: async () => [ownLink],
      listSharedLinks: async () => {
        throw new Error('db down');
      },
      createClient: async () => fakeClient({}),
    });
    await expect(provider.listRoots('user-1')).resolves.toHaveLength(1);
  });
});

describe('list', () => {
  it('returns one level with folders first and marks what is readable', async () => {
    const provider = makeProvider(
      fakeClient({
        '': [file('notiz.txt'), dir('Reden'), file('bild.heic')],
      })
    );
    const listing = await provider.list(root, '');
    expect(listing.entries.map((e) => e.name)).toEqual(['Reden', 'bild.heic', 'notiz.txt']);
    expect(listing.entries.map((e) => e.isSupported)).toEqual([false, false, true]);
    expect(listing.folderCount).toBe(1);
  });

  it('descends when asked, and reports the depth cap instead of hiding it', async () => {
    const provider = makeProvider(
      fakeClient({
        '': [dir('A')],
        A: [dir('A/B')],
        'A/B': [file('A/B/tief.pdf')],
      })
    );
    const shallow = await provider.list(root, '', { recursive: true, maxDepth: 1 });
    expect(shallow.entries).toEqual([]);
    expect(shallow.depthLimited).toBe(true);

    const deep = await provider.list(root, '', { recursive: true, maxDepth: 3 });
    expect(deep.entries.map((e) => e.path)).toEqual(['A/B/tief.pdf']);
    expect(deep.depthLimited).toBe(false);
  });

  it('reports truncation rather than silently returning a short list', async () => {
    const provider = makeProvider(
      fakeClient({ '': [file('a.pdf'), file('b.pdf'), file('c.pdf')] })
    );
    const listing = await provider.list(root, '', { recursive: true, maxFiles: 2 });
    expect(listing.entries).toHaveLength(2);
    expect(listing.truncated).toBe(true);
  });
});

describe('find', () => {
  it('matches on a name fragment across the tree, case-insensitively', async () => {
    const provider = makeProvider(
      fakeClient({
        '': [dir('Reden'), file('Programm.pdf')],
        Reden: [file('Reden/Parteitag-2026.pdf'), file('Reden/notizen.md')],
      })
    );
    const hits = await provider.find(root, { name: 'parteitag' });
    expect(hits.entries.map((e) => e.path)).toEqual(['Reden/Parteitag-2026.pdf']);
  });

  it('filters by extension with or without the leading dot', async () => {
    const provider = makeProvider(fakeClient({ '': [file('a.pdf'), file('b.md'), dir('C')] }));
    await expect(
      provider.find(root, { extensions: ['pdf'] }).then((r) => r.entries.map((e) => e.name))
    ).resolves.toEqual(['a.pdf']);
    await expect(
      provider.find(root, { extensions: ['.md'] }).then((r) => r.entries.map((e) => e.name))
    ).resolves.toEqual(['b.md']);
  });

  it('never returns folders as a find hit', async () => {
    const provider = makeProvider(fakeClient({ '': [dir('Protokolle')] }));
    const hits = await provider.find(root, { name: 'proto' });
    expect(hits.entries).toEqual([]);
  });
});

describe('test', () => {
  it('reports how many entries the root holds, so a confirmation can say it', async () => {
    const provider = makeProvider(fakeClient({ '': [file('a.pdf'), file('b.pdf')] }));
    await expect(provider.test(root)).resolves.toEqual({ ok: true, entryCount: 2 });
  });

  it('accepts a raw link that is not saved yet', async () => {
    const provider = makeProvider(fakeClient({ '': [] }));
    await expect(provider.test({ link: 'https://w.example/s/Tok123' })).resolves.toEqual({
      ok: true,
      entryCount: 0,
    });
  });

  it('turns an unusable link into a code, not an exception', async () => {
    const provider = new NextcloudShareProvider({
      listOwnLinks: async () => [],
      listSharedLinks: async () => [],
      createClient: async () => {
        throw new Error('Invalid Nextcloud share link format');
      },
    });
    await expect(provider.test({ link: 'https://example.org/files' })).resolves.toEqual({
      ok: false,
      errorCode: 'invalid_link',
    });
  });

  it('reports a file-drop share as unusable, not as ok', async () => {
    // An upload-only ("Dateien ablegen") share authenticates fine but refuses
    // every read verb with 405 — the client classifies that as `file_drop`.
    const client = fakeClient({});
    (client.testConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      message: 'Read access denied - this is a file-drop (upload only) share',
      errorCode: 'file_drop',
    });
    const provider = makeProvider(client);
    await expect(provider.test(root)).resolves.toEqual({ ok: false, errorCode: 'file_drop' });
  });

  it('still reports ok when only the entry count fails after a passed test', async () => {
    // Deliberate: a file-drop share never reaches this point (the PROPFIND in
    // testConnection already fails with 405), so what is swallowed here is a
    // transient listing failure behind a proven-reachable link.
    const client = fakeClient({});
    (client.listFolder as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('flaky'));
    const provider = makeProvider(client);
    await expect(provider.test(root)).resolves.toEqual({ ok: true });
  });
});

describe('read-only guarantee', () => {
  it('touches the share with PROPFIND and GET only', async () => {
    const calls: string[] = [];
    const provider = makeProvider(
      fakeClient({ '': [dir('A'), file('x.pdf')], A: [file('A/y.pdf')] }, calls)
    );
    await provider.list(root, '', { recursive: true });
    await provider.find(root, { name: 'y' });
    await provider.read(root, `${PREFIX}/x.pdf`);
    await provider.test(root);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.startsWith('PROPFIND ') || c.startsWith('GET '))).toBe(true);
  });

  it('offers no write verb on the interface itself', () => {
    const provider = makeProvider(fakeClient({}));
    const surface = provider as unknown as Record<string, unknown>;
    for (const forbidden of ['write', 'put', 'upload', 'delete', 'remove', 'mkdir', 'move']) {
      expect(surface[forbidden]).toBeUndefined();
    }
  });
});

describe('path guard', () => {
  // Der Pfad kommt bei `cloud_files` aus einer MODELLANTWORT und ist damit
  // indirekt über Prompt-Injektion erreichbar. `encodeURIComponent('..')` ist
  // `'..'` — Punkte sind nicht reserviert —, und der HTTP-Client löst die
  // Punkt-Segmente beim Bau der URL auf: die Anfrage läge dann außerhalb von
  // `/public.php/webdav/`, bei unverändertem `origin`. Genau deshalb greift die
  // vorhandene Prüfung in `downloadFile` nicht, sie vergleicht ja den Host.
  const escapes = [
    '../../secrets',
    'A/../../secrets',
    '/public.php/webdav/../../remote.php/dav',
    '%2e%2e/secrets',
    'A\\..\\..\\secrets',
    'https://evil.example/x',
    '//evil.example/x',
  ];

  for (const bad of escapes) {
    it(`refuses "${bad}" — and sends nothing`, async () => {
      const calls: string[] = [];
      const provider = makeProvider(fakeClient({}, calls));
      await expect(provider.list(root, bad)).rejects.toThrow();
      await expect(provider.read(root, bad)).rejects.toThrow();
      // Der Punkt ist nicht die Ausnahme, sondern dass gar keine Anfrage
      // hinausgeht — ein Fehler NACH dem Abruf wäre keine Absicherung.
      expect(calls).toEqual([]);
    });
  }

  it('keeps an ordinary path, WebDAV prefix and stray slashes and all', async () => {
    const calls: string[] = [];
    const provider = makeProvider(fakeClient({ 'A/B': [] }, calls));
    await provider.list(root, `${PREFIX}/A/B`);
    await provider.list(root, '/A/B/');
    expect(calls).toEqual(['PROPFIND A/B', 'PROPFIND A/B']);
  });

  it('reads an empty path as the root, not as an error', async () => {
    const provider = makeProvider(fakeClient({ '': [file('x.pdf')] }));
    const listing = await provider.list(root, '');
    expect(listing.entries).toHaveLength(1);
  });
});
