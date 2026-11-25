import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

const {
  getProjectCollabDocs,
  getProjectCollabDocumentIds,
  formatProjectDocs,
  PROJECT_COLLAB_DOC_CAP,
  PROJECT_COLLAB_SEARCH_CAP,
  namedProjectDocs,
  NAMED_PROJECT_DOC_CAP,
} = await import('./projectCollabDocs.js');

describe('getProjectCollabDocs', () => {
  beforeEach(() => mockQuery.mockReset());

  it('maps subtypes to the kind read_artifact takes, once per document', async () => {
    mockQuery.mockResolvedValue([
      { id: 'a', title: 'Klimaplan', subtype: 'docs' },
      { id: 'b', title: 'Budget', subtype: 'sheets' },
      { id: 'c', title: 'Aufgaben', subtype: 'boards' },
      { id: 'd', title: 'Folien', subtype: 'presentations' },
      { id: 'e', title: 'Plakat', subtype: 'canvas' },
      { id: 'a', title: 'Klimaplan', subtype: 'docs' },
      { id: 'f', title: null, subtype: 'antrag' },
    ]);
    expect(await getProjectCollabDocs('thread-1', 'viewer')).toEqual([
      { id: 'a', title: 'Klimaplan', kind: 'doc' },
      { id: 'b', title: 'Budget', kind: 'sheet' },
      { id: 'c', title: 'Aufgaben', kind: 'board' },
      { id: 'd', title: 'Folien', kind: 'presentation' },
      { id: 'e', title: 'Plakat', kind: 'presentation' },
      { id: 'f', title: '(ohne Titel)', kind: 'doc' },
    ]);
  });

  it('binds access to the member, drops trashed rows and caps the newest', async () => {
    mockQuery.mockResolvedValue([]);
    await getProjectCollabDocs('thread-1', 'viewer');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/gm\.user_id = \$2[^]*gm\.is_active = TRUE/);
    expect(sql).toMatch(/t\.user_id::text = \$2::text OR EXISTS/);
    expect(sql).toMatch(/content_type = 'collaborative_documents'/);
    expect(sql).toMatch(/cd\.deleted_at IS NULL AND cd\.is_deleted = false/);
    // Docs und Dateien in einer Liste, gemeinsam nach Teilzeitpunkt gedeckelt.
    expect(sql).toMatch(/content_type = 'documents'/);
    expect(sql).toMatch(/d\.deleted_at IS NULL AND d\.status = 'completed'/);
    expect(sql).toMatch(/ORDER BY shared_at DESC\s+LIMIT \$3/);
    expect(params[2]).toBe(PROJECT_COLLAB_DOC_CAP);
    expect(params[3]).not.toContain('video');
  });

  it('returns nothing for a thread outside the viewer’s project', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await getProjectCollabDocs('foreign-thread', 'viewer')).toEqual([]);
  });

  it('cuts long titles', async () => {
    mockQuery.mockResolvedValue([{ id: 'a', title: 'x'.repeat(300), subtype: 'docs' }]);
    const [doc] = await getProjectCollabDocs('t', 'u');
    expect(doc!.title).toHaveLength(80);
  });
});

describe('formatProjectDocs', () => {
  it('renders nothing without shared documents', () => {
    expect(formatProjectDocs(null)).toBe('');
    expect(formatProjectDocs([])).toBe('');
  });

  it('lists title, noun, kind and id and points at read_artifact', () => {
    const out = formatProjectDocs([{ id: 'abc', title: 'Klimaplan', kind: 'doc' }]);
    expect(out).toContain('## DOKUMENTE DES PROJEKTS');
    expect(out).toContain('- Klimaplan (Dokument; kind=doc, id=abc)');
    expect(out).toContain('read_artifact');
    expect(out).toContain('Titel als Quelle');
  });

  it('stays small for a full list', () => {
    const docs = Array.from({ length: PROJECT_COLLAB_DOC_CAP }, (_, i) => ({
      id: '00000000-0000-0000-0000-00000000000' + (i % 10),
      title: `Dokument Nummer ${i} zur Klimapolitik`,
      kind: 'doc' as const,
    }));
    // 30 Zeilen samt Hinweis auf `groups` — rund 1.000 Token, nur Titel.
    expect(formatProjectDocs(docs).length).toBeLessThan(4500);
  });
});

describe('getProjectCollabDocumentIds', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns each indexed document once, newest share first', async () => {
    mockQuery.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'a' }]);
    expect(await getProjectCollabDocumentIds('thread-1', 'viewer')).toEqual(['a', 'b']);
  });

  it('opens the documents only to an active member in the thread scope, live and indexed', async () => {
    mockQuery.mockResolvedValue([]);
    await getProjectCollabDocumentIds('thread-1', 'viewer');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/gm\.user_id = \$2[^]*gm\.is_active = TRUE/);
    expect(sql).toMatch(/t\.user_id::text = \$2::text OR EXISTS/);
    expect(sql).toMatch(/g\.deleted_at IS NULL/);
    expect(sql).toMatch(/cd\.deleted_at IS NULL AND cd\.is_deleted = false/);
    expect(sql).toMatch(/JOIN collab_search_index ci[^]*ci\.chunk_count > 0/);
    expect(sql).toMatch(/ORDER BY gcs\.shared_at DESC/);
    expect(params).toEqual(['thread-1', 'viewer', PROJECT_COLLAB_SEARCH_CAP]);
  });

  it('returns nothing for a chat outside any project or for a non-member', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await getProjectCollabDocumentIds('thread-1', 'stranger')).toEqual([]);
  });
});

describe('namedProjectDocs (#5952)', () => {
  const docs = [
    { id: 'f6', title: '06_protokoll_buergerbus.md', kind: 'file' as const },
    { id: 'f8', title: '08_protokoll_waermeplanung.md', kind: 'file' as const },
    { id: 'd1', title: 'Haushaltsklausur 2027', kind: 'doc' as const },
    { id: 'n1', title: 'Notizen', kind: 'doc' as const },
  ];

  it('erkennt Dateinamen mit und ohne Endung, Groß/klein egal', () => {
    expect(namedProjectDocs('Lies 06_protokoll_buergerbus.md ganz', docs).map((d) => d.id)).toEqual(
      ['f6']
    );
    expect(
      namedProjectDocs('Was steht in 08_Protokoll_Waermeplanung?', docs).map((d) => d.id)
    ).toEqual(['f8']);
    expect(
      namedProjectDocs('Fass die Haushaltsklausur 2027 zusammen', docs).map((d) => d.id)
    ).toEqual(['d1']);
  });

  it('deckelt bei zwei und ignoriert kurze Alltagstitel', () => {
    const text =
      'Vergleiche 06_protokoll_buergerbus, 08_protokoll_waermeplanung und Haushaltsklausur 2027';
    expect(namedProjectDocs(text, docs)).toHaveLength(NAMED_PROJECT_DOC_CAP);
    expect(namedProjectDocs('Schreib mir Notizen zum Treffen', docs)).toEqual([]);
  });

  it('ohne Titelliste oder Treffer nichts', () => {
    expect(namedProjectDocs('Lies das Protokoll', docs)).toEqual([]);
    expect(namedProjectDocs('06_protokoll_buergerbus.md', null)).toEqual([]);
  });
});
