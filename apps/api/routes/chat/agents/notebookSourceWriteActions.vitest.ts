/**
 * Die schreibenden Aktionen von `notebook_quellen` gegen Fakes — kein Qdrant,
 * kein Postgres, kein Crawler. Gefahren wird über das Werkzeug selbst, damit
 * auch die Weiche in `notebookSourceTools.ts` mitgeprüft ist. Pro Aktion zuerst
 * die Ablehnungen, dann der Erfolgsfall samt Neuzählung.
 */
import { NOTEBOOK_MAX_DOCUMENTS } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

import { makeNotebookSourcesTool } from './notebookSourceTools.js';
import { WRITE_ACTIONS, type NotebookSourceWriteDeps } from './notebookSourceWriteActions.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { NotebookAccess } from '../../notebook/notebookAccess.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

type ToolResult = Record<string, unknown>;

const OWNER: NotebookAccess = { exists: true, isOwner: true, canRead: true, canEdit: true };
const EDITOR: NotebookAccess = { exists: true, isOwner: false, canRead: true, canEdit: true };
const READER: NotebookAccess = { exists: true, isOwner: false, canRead: true, canEdit: false };
const DENIED: NotebookAccess = { exists: false, isOwner: false, canRead: false, canEdit: false };

function collection(id: string, name: string): NotebookCollection {
  return {
    id,
    user_id: 'user-1',
    name,
    description: null,
    custom_prompt: null,
    slug_suffix: 'Ab3xK9',
    document_count: 0,
    settings: {},
  } as unknown as NotebookCollection;
}

interface DocFake {
  user_id: string;
  title: string;
  metadata?: unknown;
}

interface CtxOptions {
  userId?: string | null;
  userText?: string;
  access?: Record<string, NotebookAccess>;
  /** Mitgliedschaften je Notebook. */
  members?: Record<string, string[]>;
  docs?: Record<string, DocFake>;
  crawl?: Awaited<ReturnType<NotebookSourceWriteDeps['crawlUrl']>>;
  urlValid?: boolean;
  setChunkTitleThrows?: boolean;
}

function makeCtx(opts: CtxOptions = {}) {
  const notes: Array<[string, string]> = [];
  const sourceRegistry = {
    note: (title: string, content: string) => notes.push([title, content]),
    register: () => '[1] Auszug',
  } as unknown as SourceRegistry;
  const sse = { send: () => {} } as unknown as SSEWriter;
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'user-1' : opts.userId },
    userLocale: 'de-DE',
    messages: opts.userText ? [{ role: 'user', content: opts.userText }] : [],
    notebookIds: ['n1'],
  } as unknown as ChatGraphState;

  const notebooks: Record<string, NotebookCollection> = {
    n1: collection('n1', 'Kreisverband'),
    n2: collection('n2', 'Wahlkampf'),
  };
  const members: Record<string, Set<string>> = {
    n1: new Set(opts.members?.n1 ?? ['d1', 'd2']),
    n2: new Set(opts.members?.n2 ?? []),
  };
  const docs: Record<string, DocFake> = opts.docs ?? {
    d1: { user_id: 'user-1', title: 'Antrag Radweg', metadata: { tags: ['Verkehr'] } },
    d2: { user_id: 'user-1', title: 'Protokoll', metadata: null },
  };

  const helper = {
    getNotebookCollection: vi.fn(async (id: string) => notebooks[id] ?? null),
    getCollectionDocuments: vi.fn(async (id: string) =>
      [...(members[id] ?? [])].map((document_id) => ({
        document_id,
        added_at: '',
        added_by: null,
      }))
    ),
    isDocumentInCollection: vi.fn(async (id: string, doc: string) => !!members[id]?.has(doc)),
    addDocumentsToCollection: vi.fn(async (id: string, ids: string[]) => {
      for (const d of ids) members[id]?.add(d);
      return { success: true, added_count: ids.length };
    }),
    removeDocumentsFromCollection: vi.fn(async (id: string, ids: string[]) => {
      for (const d of ids) members[id]?.delete(d);
      return { success: true, removed_count: ids.length };
    }),
    updateNotebookCollection: vi.fn(async () => ({ success: true })),
  };
  const db = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('UPDATE documents')) {
        const [, id, user] = params as [string, string, string];
        return docs[id]?.user_id === user ? [{ id }] : [];
      }
      if (sql.includes('WHERE id = ANY($1)')) {
        return (params[0] as string[])
          .filter((id) => docs[id])
          .map((id) => ({ id, user_id: docs[id]!.user_id }));
      }
      if (sql.includes('SELECT metadata FROM documents')) {
        const d = docs[params[0] as string];
        return d ? [{ metadata: d.metadata ?? null }] : [];
      }
      if (sql.includes('SELECT user_id, title FROM documents')) {
        const d = docs[params[0] as string];
        return d ? [{ user_id: d.user_id, title: d.title }] : [];
      }
      return [];
    }),
  };
  const access = vi.fn(async (id: string) => opts.access?.[id] ?? OWNER);
  const processText = vi.fn(async (_u: string, title: string) => ({ id: 'new-note', title }));
  const processUrl = vi.fn(async (_u: string, _url: string, title: string) => ({
    id: 'new-url',
    title,
  }));
  const crawlUrl = vi.fn(
    async () =>
      opts.crawl ?? {
        success: true,
        data: { title: 'Seitentitel', content: 'Inhalt der Seite, lang genug.' },
      }
  );
  const validateUrl = vi.fn(async (raw: string) =>
    opts.urlValid === false
      ? { isValid: false, error: 'Private IP addresses are not allowed' }
      : { isValid: true, url: new URL(raw) }
  );
  const setChunkTitle = vi.fn(async () => {
    if (opts.setChunkTitleThrows) throw new Error('qdrant down');
  });

  const deps = {
    helper,
    db,
    access,
    processText,
    processUrl,
    crawlUrl,
    validateUrl,
    setChunkTitle,
  } as unknown as NotebookSourceWriteDeps;
  const tool = makeNotebookSourcesTool({ state, sse, threadId: 't1', sourceRegistry, deps });
  const run = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<ToolResult>)(
      { mode: 'hybrid', rerank: false, ...args },
      {}
    )) ?? {};
  return {
    run,
    notes,
    helper,
    db,
    access,
    members,
    processText,
    processUrl,
    crawlUrl,
    validateUrl,
    setChunkTitle,
  };
}

const FORBIDDING = 'Ändere bitte nichts, antworte nur im Chat.';
const NO_EDIT = 'Keine Berechtigung, dieses Notebook zu bearbeiten.';

describe('WRITE_ACTIONS', () => {
  it('lists the seven write actions', () => {
    expect(WRITE_ACTIONS).toEqual([
      'remove',
      'move',
      'copy',
      'rename',
      'tag',
      'add_note',
      'add_url',
    ]);
  });
});

describe('common gates', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['remove', { action: 'remove', sourceIds: ['d1'] }],
    ['move', { action: 'move', sourceIds: ['d1'], targetNotebookId: 'n2' }],
    ['copy', { action: 'copy', sourceIds: ['d1'], targetNotebookId: 'n2' }],
    ['rename', { action: 'rename', sourceId: 'd1', title: 'Neu' }],
    ['tag', { action: 'tag', sourceId: 'd1', add: ['Rad'] }],
    ['add_note', { action: 'add_note', title: 'Notiz', text: 'Eine Notiz mit genug Zeichen.' }],
    ['add_url', { action: 'add_url', url: 'https://example.org/artikel' }],
  ];

  it.each(cases)('%s needs a session', async (_label, args) => {
    const { run, helper } = makeCtx({ userId: null });
    expect((await run(args)).error).toMatch(/Nutzer-Sitzung/);
    expect(helper.getNotebookCollection).not.toHaveBeenCalled();
  });

  it.each(cases)('%s is refused when the turn rules out changes', async (_label, args) => {
    const { run, helper, db, processText, crawlUrl } = makeCtx({ userText: FORBIDDING });
    expect(String((await run(args)).error)).toContain('schließt Änderungen aus');
    expect(helper.getNotebookCollection).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(processText).not.toHaveBeenCalled();
    expect(crawlUrl).not.toHaveBeenCalled();
  });

  it.each(cases)('%s needs edit rights on the notebook', async (_label, args) => {
    const { run, helper, db, processText, crawlUrl } = makeCtx({ access: { n1: READER } });
    expect((await run(args)).error).toBe(NO_EDIT);
    expect(helper.addDocumentsToCollection).not.toHaveBeenCalled();
    expect(helper.removeDocumentsFromCollection).not.toHaveBeenCalled();
    expect(helper.updateNotebookCollection).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
    expect(processText).not.toHaveBeenCalled();
    expect(crawlUrl).not.toHaveBeenCalled();
  });

  it.each(cases)('%s hides notebooks the caller cannot read', async (_label, args) => {
    const { run } = makeCtx({ access: { n1: DENIED } });
    expect((await run(args)).error).toBe('Notebook nicht gefunden oder kein Zugriff.');
  });

  it('reports a service failure as a fixed German error, never as success', async () => {
    const { run, helper } = makeCtx();
    helper.removeDocumentsFromCollection.mockRejectedValueOnce(new Error('Qdrant timeout'));
    const out = await run({ action: 'remove', sourceIds: ['d1'] });
    expect(out.ok).toBeUndefined();
    expect(out.error).toBe(
      'Die Quellen ließen sich gerade nicht entfernen — es wurde nichts bestätigt, bitte später erneut versuchen.'
    );
  });
});

describe('remove', () => {
  it('refuses when none of the ids is in the notebook', async () => {
    const { run, helper } = makeCtx();
    const out = await run({ action: 'remove', sourceIds: ['fremd'] });
    expect(String(out.error)).toContain('fremd');
    expect(helper.removeDocumentsFromCollection).not.toHaveBeenCalled();
  });

  it('removes the known ids, lists unknown ones as skipped and recounts', async () => {
    const { run, helper, notes } = makeCtx();
    const out = await run({ action: 'remove', sourceIds: ['d1', 'fremd', 'd1'] });
    expect(helper.removeDocumentsFromCollection).toHaveBeenCalledWith('n1', ['d1']);
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n1', { document_count: 1 });
    expect(out).toMatchObject({ ok: true, removed: 1, skipped: ['fremd'] });
    expect(String(out.note)).toContain(
      'Aus dem Notebook entfernt — die Dokumente bleiben in der Bibliothek (rückgängig mit notebooks add_documents).'
    );
    expect(notes).toHaveLength(1);
  });

  // add_documents nimmt nur eigene Dokumente — der Rückweg gilt nur für sie.
  it('names who can re-add a removed foreign upload instead of promising add_documents', async () => {
    const { run } = makeCtx({
      access: { n1: EDITOR },
      docs: {
        d1: { user_id: 'owner-2', title: 'Fremd' },
        d2: { user_id: 'user-1', title: 'Eigen' },
      },
    });
    const out = await run({ action: 'remove', sourceIds: ['d1', 'd2'] });
    expect(out.ok).toBe(true);
    const note = String(out.note);
    expect(note).not.toContain(
      'Aus dem Notebook entfernt — die Dokumente bleiben in der Bibliothek (rückgängig mit notebooks add_documents).'
    );
    expect(note).toContain('1 davon hat jemand anderes hochgeladen');
    expect(note).toContain('nur diese Person kann sie wieder hinzufügen');
  });

  it('works for an editor of a shared notebook', async () => {
    const { run, helper } = makeCtx({ access: { n1: EDITOR } });
    expect((await run({ action: 'remove', sourceIds: ['d2'] })).ok).toBe(true);
    expect(helper.removeDocumentsFromCollection).toHaveBeenCalledWith('n1', ['d2']);
  });
});

describe('move / copy', () => {
  it('needs a target notebook', async () => {
    const { run } = makeCtx();
    expect(String((await run({ action: 'copy', sourceIds: ['d1'] })).error)).toContain(
      'targetNotebookId'
    );
  });

  it('refuses the same notebook as target', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'move', sourceIds: ['d1'], targetNotebookId: 'n1' });
    expect(String(out.error)).toContain('dasselbe Notebook');
  });

  it('needs edit rights on the target', async () => {
    const { run, helper } = makeCtx({ access: { n2: READER } });
    const out = await run({ action: 'copy', sourceIds: ['d1'], targetNotebookId: 'n2' });
    expect(out.error).toBe('Keine Berechtigung, das Ziel-Notebook zu bearbeiten.');
    expect(helper.addDocumentsToCollection).not.toHaveBeenCalled();
  });

  it('hides a target the caller cannot read', async () => {
    const { run } = makeCtx({ access: { n2: DENIED } });
    const out = await run({ action: 'copy', sourceIds: ['d1'], targetNotebookId: 'n2' });
    expect(out.error).toBe('Ziel-Notebook nicht gefunden oder kein Zugriff.');
  });

  it('refuses system notebooks as target', async () => {
    const { run } = makeCtx();
    const out = await run({
      action: 'copy',
      sourceIds: ['d1'],
      targetNotebookId: 'grundsatz-system',
    });
    expect(String(out.error)).toContain('System-Notebooks');
  });

  it('refuses when no id is in the source notebook', async () => {
    const { run, helper } = makeCtx();
    const out = await run({ action: 'copy', sourceIds: ['fremd'], targetNotebookId: 'n2' });
    expect(String(out.error)).toContain('fremd');
    expect(helper.addDocumentsToCollection).not.toHaveBeenCalled();
  });

  // Wie `add_documents` und die REST-Route: in ein Notebook wandern nur eigene
  // Dokumente — sonst zöge ein Mitglied fremde Uploads in eigene Freigaben.
  it('does not carry someone else’s upload into another notebook', async () => {
    const { run, helper } = makeCtx({
      docs: {
        d1: { user_id: 'owner-2', title: 'Fremd' },
        d2: { user_id: 'user-1', title: 'Eigen' },
      },
    });
    const out = await run({ action: 'copy', sourceIds: ['d1', 'd2'], targetNotebookId: 'n2' });
    expect(helper.addDocumentsToCollection).toHaveBeenCalledWith('n2', ['d2'], 'user-1');
    expect(out).toMatchObject({ ok: true, foreign: ['d1'] });
  });

  it('respects NOTEBOOK_MAX_DOCUMENTS on the target', async () => {
    const full = Array.from({ length: NOTEBOOK_MAX_DOCUMENTS }, (_, i) => `x${i}`);
    const { run, helper } = makeCtx({ members: { n1: ['d1'], n2: full } });
    const out = await run({ action: 'copy', sourceIds: ['d1'], targetNotebookId: 'n2' });
    expect(out.error).toBe(`Ein Notebook fasst höchstens ${NOTEBOOK_MAX_DOCUMENTS} Dokumente.`);
    expect(helper.addDocumentsToCollection).not.toHaveBeenCalled();
  });

  it('copy adds to the target, keeps the source and recounts the target', async () => {
    const { run, helper, members } = makeCtx();
    const out = await run({ action: 'copy', sourceIds: ['d1'], targetNotebookId: 'n2' });
    expect(helper.addDocumentsToCollection).toHaveBeenCalledWith('n2', ['d1'], 'user-1');
    expect(helper.removeDocumentsFromCollection).not.toHaveBeenCalled();
    expect(members.n1?.has('d1')).toBe(true);
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n2', { document_count: 1 });
    expect(out).toMatchObject({ ok: true, copied: 1 });
    expect(String(out.note)).toContain('„Wahlkampf"');
  });

  it('move adds to the target, removes from the source and recounts both', async () => {
    const { run, helper, members } = makeCtx();
    const out = await run({ action: 'move', sourceIds: ['d1', 'd2'], targetNotebookId: 'n2' });
    expect(helper.addDocumentsToCollection).toHaveBeenCalledWith('n2', ['d1', 'd2'], 'user-1');
    expect(helper.removeDocumentsFromCollection).toHaveBeenCalledWith('n1', ['d1', 'd2']);
    expect(members.n1?.size).toBe(0);
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n2', { document_count: 2 });
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n1', { document_count: 0 });
    expect(out).toMatchObject({ ok: true, moved: 2 });
  });

  it('reports a half-done move honestly when removing from the source fails', async () => {
    const { run, helper, members } = makeCtx();
    helper.removeDocumentsFromCollection.mockRejectedValueOnce(new Error('Qdrant timeout'));
    const out = await run({ action: 'move', sourceIds: ['d1'], targetNotebookId: 'n2' });
    expect(members.n2?.has('d1')).toBe(true);
    expect(out.ok).toBe(false);
    expect(out.error).toBe(
      'Die Quellen wurden nach „Wahlkampf" kopiert, ließen sich aber nicht aus „Kreisverband" entfernen — ein erneuter move schließt das Verschieben ab.'
    );
  });

  it('does not add twice what the target already holds', async () => {
    const { run, helper } = makeCtx({ members: { n1: ['d1'], n2: ['d1'] } });
    const out = await run({ action: 'copy', sourceIds: ['d1'], targetNotebookId: 'n2' });
    expect(helper.addDocumentsToCollection).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: true, copied: 0, alreadyInTarget: 1 });
  });
});

describe('rename', () => {
  it('needs sourceId and title', async () => {
    const { run } = makeCtx();
    expect(String((await run({ action: 'rename', title: 'Neu' })).error)).toContain('sourceId');
    expect(String((await run({ action: 'rename', sourceId: 'd1' })).error)).toContain('title');
  });

  it('refuses a source outside the notebook', async () => {
    const { run, db } = makeCtx();
    const out = await run({ action: 'rename', sourceId: 'd9', title: 'Neu' });
    expect(out.error).toBe('Quelle nicht in diesem Notebook oder kein Zugriff.');
    expect(db.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('refuses someone else’s upload, even for an editor', async () => {
    const { run, db, setChunkTitle } = makeCtx({
      access: { n1: EDITOR },
      docs: { d1: { user_id: 'owner-2', title: 'Fremd' } },
      members: { n1: ['d1'] },
    });
    const out = await run({ action: 'rename', sourceId: 'd1', title: 'Neu' });
    expect(out.error).toBe(
      'Umbenennen und Verschlagworten geht nur bei Quellen, die du selbst hochgeladen hast.'
    );
    expect(db.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
    expect(setChunkTitle).not.toHaveBeenCalled();
  });

  it('updates the row scoped to the caller and the chunk titles', async () => {
    const { run, db, setChunkTitle, notes } = makeCtx();
    const out = await run({ action: 'rename', sourceId: 'd1', title: '  Radweg 2027 ' });
    const update = db.query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));
    expect(update?.[0]).toContain(
      'SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3'
    );
    expect(update?.[1]).toEqual(['Radweg 2027', 'd1', 'user-1']);
    expect(setChunkTitle).toHaveBeenCalledWith('d1', 'user-1', 'Radweg 2027');
    expect(out).toMatchObject({ ok: true, sourceId: 'd1', title: 'Radweg 2027' });
    expect(notes).toHaveLength(1);
  });

  it('stays a success when only the chunk titles fail', async () => {
    const { run } = makeCtx({ setChunkTitleThrows: true });
    expect((await run({ action: 'rename', sourceId: 'd1', title: 'Neu' })).ok).toBe(true);
  });
});

describe('tag', () => {
  it('needs add or remove', async () => {
    const { run } = makeCtx();
    expect(String((await run({ action: 'tag', sourceId: 'd1' })).error)).toContain('add');
  });

  it('refuses a source outside the notebook', async () => {
    const { run } = makeCtx();
    const out = await run({ action: 'tag', sourceId: 'd9', add: ['Rad'] });
    expect(out.error).toBe('Quelle nicht in diesem Notebook oder kein Zugriff.');
  });

  it('refuses someone else’s upload', async () => {
    const { run, db } = makeCtx({ docs: { d1: { user_id: 'owner-2', title: 'Fremd' } } });
    const out = await run({ action: 'tag', sourceId: 'd1', add: ['Rad'] });
    expect(String(out.error)).toContain('selbst hochgeladen');
    expect(db.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('refuses tags over 40 characters and more than 20 tags', async () => {
    const { run } = makeCtx();
    expect(
      String((await run({ action: 'tag', sourceId: 'd1', add: ['x'.repeat(41)] })).error)
    ).toContain('40');
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(String((await run({ action: 'tag', sourceId: 'd1', add: many })).error)).toContain('20');
  });

  it('merges, dedupes case-insensitively, removes and writes the tag list', async () => {
    const { run, db } = makeCtx();
    const out = await run({
      action: 'tag',
      sourceId: 'd1',
      add: [' Radweg ', 'verkehr', 'radweg', ''],
      remove: ['VERKEHR'],
    });
    const update = db.query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));
    expect(update?.[0]).toContain(
      "jsonb_set(coalesce(metadata,'{}'::jsonb), '{tags}', $1::jsonb) WHERE id = $2 AND user_id = $3"
    );
    expect(update?.[1]).toEqual([JSON.stringify(['Radweg']), 'd1', 'user-1']);
    expect(out).toMatchObject({ ok: true, tags: ['Radweg'] });
  });

  it('creates the tag list when metadata is missing', async () => {
    const { run, db } = makeCtx();
    await run({ action: 'tag', sourceId: 'd2', add: ['Protokoll'] });
    const update = db.query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));
    expect(update?.[1]).toEqual([JSON.stringify(['Protokoll']), 'd2', 'user-1']);
  });
});

describe('add_note', () => {
  it('needs a title and at least 20 characters of text', async () => {
    const { run, processText } = makeCtx();
    expect(String((await run({ action: 'add_note', text: 'x'.repeat(30) })).error)).toContain(
      'title'
    );
    expect(String((await run({ action: 'add_note', title: 'T', text: 'kurz' })).error)).toContain(
      '20'
    );
    expect(processText).not.toHaveBeenCalled();
  });

  it('refuses a full notebook before creating any embedding', async () => {
    const full = Array.from({ length: NOTEBOOK_MAX_DOCUMENTS }, (_, i) => `x${i}`);
    const { run, processText } = makeCtx({ members: { n1: full } });
    const out = await run({ action: 'add_note', title: 'T', text: 'x'.repeat(30) });
    expect(out.error).toBe(`Ein Notebook fasst höchstens ${NOTEBOOK_MAX_DOCUMENTS} Dokumente.`);
    expect(processText).not.toHaveBeenCalled();
  });

  it('processes the text as a note, adds it and recounts', async () => {
    const { run, processText, helper } = makeCtx();
    const text = 'Beschluss: Der Radweg kommt 2027.';
    const out = await run({ action: 'add_note', title: ' Beschluss ', text });
    expect(processText).toHaveBeenCalledWith('user-1', 'Beschluss', text, 'note');
    expect(helper.addDocumentsToCollection).toHaveBeenCalledWith('n1', ['new-note'], 'user-1');
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n1', { document_count: 3 });
    expect(out).toMatchObject({ ok: true, sourceId: 'new-note', title: 'Beschluss' });
  });
});

describe('add_url', () => {
  it('needs a url', async () => {
    const { run } = makeCtx();
    expect(String((await run({ action: 'add_url' })).error)).toContain('url');
  });

  it('refuses an invalid or private url without fetching', async () => {
    const { run, crawlUrl, processUrl } = makeCtx({ urlValid: false });
    const out = await run({ action: 'add_url', url: 'http://169.254.169.254/latest' });
    expect(out.error).toBe(
      'Diese URL ist ungültig oder nicht erlaubt — nur öffentliche http(s)-Adressen.'
    );
    expect(crawlUrl).not.toHaveBeenCalled();
    expect(processUrl).not.toHaveBeenCalled();
  });

  it('refuses a full notebook before fetching', async () => {
    const full = Array.from({ length: NOTEBOOK_MAX_DOCUMENTS }, (_, i) => `x${i}`);
    const { run, crawlUrl } = makeCtx({ members: { n1: full } });
    const out = await run({ action: 'add_url', url: 'https://example.org/a' });
    expect(out.error).toBe(`Ein Notebook fasst höchstens ${NOTEBOOK_MAX_DOCUMENTS} Dokumente.`);
    expect(crawlUrl).not.toHaveBeenCalled();
  });

  it('reports an empty or failed crawl', async () => {
    const { run, processUrl } = makeCtx({ crawl: { success: false, error: 'HTTP 404' } });
    const out = await run({ action: 'add_url', url: 'https://example.org/weg' });
    expect(out.error).toBe(
      'Die Seite ließ sich nicht laden oder enthielt keinen lesbaren Text — es wurde nichts importiert.'
    );
    expect(processUrl).not.toHaveBeenCalled();
  });

  // SSRF: nur die von validateUrlForFetch zurückgegebene, normalisierte URL
  // erreicht den Crawler — nie der Rohtext des Modells.
  it('fetches only the validated url, imports the page, adds it and recounts', async () => {
    const { run, validateUrl, crawlUrl, processUrl, helper } = makeCtx();
    const out = await run({ action: 'add_url', url: '  HTTPS://Example.org/a b  ' });
    expect(validateUrl).toHaveBeenCalledWith('HTTPS://Example.org/a b');
    const validated = (await validateUrl.mock.results[0]!.value) as { url: URL };
    expect(crawlUrl).toHaveBeenCalledWith(validated.url.toString());
    expect(crawlUrl).toHaveBeenCalledWith('https://example.org/a%20b');
    expect(processUrl).toHaveBeenCalledWith(
      'user-1',
      'https://example.org/a%20b',
      'Seitentitel',
      'Inhalt der Seite, lang genug.',
      'url'
    );
    expect(helper.addDocumentsToCollection).toHaveBeenCalledWith('n1', ['new-url'], 'user-1');
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n1', { document_count: 3 });
    expect(out).toMatchObject({ ok: true, sourceId: 'new-url', title: 'Seitentitel' });
  });

  it('prefers the given title', async () => {
    const { run, processUrl } = makeCtx();
    await run({ action: 'add_url', url: 'https://example.org/a', title: 'Eigener Titel' });
    expect(processUrl.mock.calls[0]?.[2]).toBe('Eigener Titel');
  });
});
