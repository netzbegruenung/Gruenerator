/**
 * Die Endpunkte, auf denen der Notebook-Hub steht: ein leeres Notebook
 * anlegen, Quellen anhängen ohne die Menge zu ersetzen, und einen Wolke-Ordner
 * per eingefügtem Freigabelink anhängen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHelper = vi.hoisted(() => ({
  storeNotebookCollection: vi.fn(async () => ({ collection_id: 'nb-1', slug_suffix: 'abc123' })),
  addDocumentsToCollection: vi.fn(async () => ({ success: true, added_count: 0 })),
  deleteNotebookCollection: vi.fn(),
  getNotebookCollection: vi.fn(),
  getCollectionDocuments: vi.fn(async (): Promise<Array<{ document_id: string }>> => []),
  updateNotebookCollection: vi.fn(),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return mockHelper;
  },
}));

const mockPg = vi.hoisted(() => ({ query: vi.fn(async (): Promise<unknown[]> => []) }));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => mockPg,
}));

const mockAttach = vi.hoisted(() => vi.fn());
vi.mock('../../services/notebook/notebookWolkeAttach.js', () => ({
  attachWolkeFolderToNotebook: mockAttach,
}));

const mockShareManager = vi.hoisted(() => ({ findOrSaveShareLink: vi.fn() }));
vi.mock('../../utils/integrations/nextcloud/index.js', () => ({
  NextcloudShareManager: mockShareManager,
}));

vi.mock('../../services/usage/ItemUsageService.js', () => ({
  getUsageMap: vi.fn(async () => new Map()),
}));
vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: vi.fn(),
}));
vi.mock('../../services/entityLikes/EntityLikesService.js', () => ({
  getLikeCountsForEntities: vi.fn(async () => new Map()),
  getLikedEntityIdsForUser: vi.fn(),
  likeEntity: vi.fn(),
  unlikeEntity: vi.fn(),
}));
vi.mock('../../services/notifications/NotificationService.js', () => ({
  createNotification: vi.fn(),
}));
vi.mock('../../services/user/ProfileService.js', () => ({
  getProfileService: vi.fn(),
}));
const mockAccess = vi.hoisted(() => ({
  readNotebookWithAccess: vi.fn(),
  requireNotebookEdit: vi.fn(async (): Promise<unknown> => null),
  requireNotebookOwner: vi.fn(),
  requireNotebookRead: vi.fn(),
}));
vi.mock('./notebookAccess.js', () => mockAccess);

import { notebookCollectionsContractRouter } from './notebookCollectionsContractRouter.js';

type Handler = (args: unknown) => Promise<{ status: number; body: Record<string, unknown> }>;
const handler = (name: keyof typeof notebookCollectionsContractRouter) =>
  notebookCollectionsContractRouter[name] as unknown as Handler;
const req = {
  user: { id: 'user-1', locale: 'de-DE' },
  originalUrl: '/api/auth/notebook-collections',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPg.query.mockResolvedValue([]);
  mockHelper.getCollectionDocuments.mockResolvedValue([]);
  mockAccess.requireNotebookEdit.mockResolvedValue(null);
});

describe('createCollection', () => {
  it('legt ein Notebook ohne Dokumente an', async () => {
    const res = await handler('createCollection')({
      req,
      body: { name: 'Unbenanntes Notebook' },
    });

    expect(res.status).toBe(201);
    expect(mockHelper.storeNotebookCollection).toHaveBeenCalledTimes(1);
    expect(mockHelper.addDocumentsToCollection).not.toHaveBeenCalled();
  });

  it('nimmt de-AT aus dem X-User-Locale-Header, wenn das Profil kein Land trägt', async () => {
    await handler('createCollection')({
      req: { ...req, user: { id: 'user-1' }, headers: { 'x-user-locale': 'de-AT' } },
      body: { name: 'Unbenanntes Notebook' },
    });

    expect(mockHelper.storeNotebookCollection).toHaveBeenCalledWith(
      expect.objectContaining({ audience: 'de-AT' })
    );
  });
});

describe('addDocuments', () => {
  const call = (body: unknown) => handler('addDocuments')({ req, params: { id: 'nb-1' }, body });

  beforeEach(() => {
    mockHelper.getNotebookCollection.mockResolvedValue({ id: 'nb-1', settings: {} });
  });

  it('hängt nur Neues an und zählt die Menge fort', async () => {
    mockPg.query.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    mockHelper.getCollectionDocuments.mockResolvedValue([{ document_id: 'd1' }]);

    const res = await call({ document_ids: ['d1', 'd2'] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ added: 1, document_count: 2 });
    expect(mockHelper.addDocumentsToCollection).toHaveBeenCalledWith('nb-1', ['d2'], 'user-1');
  });

  it('lehnt fremde Dokumente ab', async () => {
    mockPg.query.mockResolvedValue([{ id: 'd1' }]);

    const res = await call({ document_ids: ['d1', 'fremd'] });

    expect(res.status).toBe(403);
    expect(mockHelper.addDocumentsToCollection).not.toHaveBeenCalled();
  });

  it('ersetzt einen verknüpften Doc mit gleicher docId, statt ihn zu doppeln', async () => {
    mockPg.query.mockResolvedValue([{ id: 'd9' }]);
    mockHelper.getNotebookCollection.mockResolvedValue({
      id: 'nb-1',
      settings: {
        linked_docs: [{ docId: 'doc-a', docTitle: 'Alt', documentId: 'd0', lastSyncedAt: null }],
      },
    });

    await call({
      document_ids: ['d9'],
      linked_docs: [{ docId: 'doc-a', docTitle: 'Neu', documentId: 'd9', lastSyncedAt: null }],
    });

    const update = mockHelper.updateNotebookCollection.mock.calls[0] as unknown as [
      string,
      { settings: { linked_docs: Array<{ docTitle: string }> } },
    ];
    expect(update[1].settings.linked_docs.map((d) => d.docTitle)).toEqual(['Neu']);
  });

  it('verweigert ohne Bearbeitungsrecht', async () => {
    mockAccess.requireNotebookEdit.mockResolvedValue({
      status: 403,
      body: { error: 'Keine Berechtigung' },
    });

    const res = await call({ document_ids: ['d1'] });

    expect(res.status).toBe(403);
    expect(mockPg.query).not.toHaveBeenCalled();
  });
});

describe('attachWolke', () => {
  const call = (body: unknown) => handler('attachWolke')({ req, params: { id: 'nb-1' }, body });
  const result = {
    folderName: 'Grünerator',
    total: 3,
    alreadyImported: 0,
    importedNow: 3,
    queued: 0,
    failed: 0,
  };

  it('legt den Freigabelink an und hängt dessen Wurzel an', async () => {
    mockShareManager.findOrSaveShareLink.mockResolvedValue({ id: 'link-1' });
    mockAttach.mockResolvedValue(result);

    const res = await call({
      url: 'https://wolke.netzbegruenung.de/s/k3Fq9xLm',
      includeSubfolders: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ shareLinkId: 'link-1', importedNow: 3 });
    expect(mockAttach).toHaveBeenCalledWith({
      userId: 'user-1',
      collectionId: 'nb-1',
      shareLinkId: 'link-1',
      folderPath: '/',
      includeSubfolders: true,
    });
  });

  it('synchronisiert einen angehängten Ordner über shareLinkId + Pfad', async () => {
    mockAttach.mockResolvedValue(result);

    await call({ shareLinkId: 'link-1', folderPath: '/Presse', includeSubfolders: false });

    expect(mockShareManager.findOrSaveShareLink).not.toHaveBeenCalled();
    expect(mockAttach).toHaveBeenCalledWith(
      expect.objectContaining({ shareLinkId: 'link-1', folderPath: '/Presse' })
    );
  });

  it('meldet einen ungültigen Link als 400', async () => {
    mockShareManager.findOrSaveShareLink.mockRejectedValue(new Error('Invalid'));

    const res = await call({ url: 'https://example.org', includeSubfolders: true });

    expect(res.status).toBe(400);
    expect(mockAttach).not.toHaveBeenCalled();
  });
});

describe('updateCollection visibility', () => {
  const call = (patch: Record<string, unknown>) =>
    handler('updateCollection')({
      req,
      params: { id: 'nb-1' },
      body: { name: 'Updated notebook', ...patch },
    });

  beforeEach(() => {
    mockHelper.getNotebookCollection.mockResolvedValue({
      id: 'nb-1',
      user_id: 'user-1',
      share_mode: 'private',
      is_public: false,
      settings: {},
    });
  });

  it.each(['private', 'groups'])(
    'rejects listing with share_mode %s before writing',
    async (share_mode) => {
      mockHelper.getNotebookCollection.mockResolvedValue({
        id: 'nb-1',
        user_id: 'user-1',
        share_mode,
        is_public: false,
        settings: {},
      });

      mockPg.query.mockResolvedValue([{ id: 'd1' }]);
      const res = await call({ is_public: true, public_ownership: 'owner', document_ids: ['d1'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Mit Anmeldung');
      expect(mockHelper.updateNotebookCollection).not.toHaveBeenCalled();
      expect(mockPg.query).not.toHaveBeenCalled();
      expect(mockHelper.addDocumentsToCollection).not.toHaveBeenCalled();
    }
  );

  it('rejects listing without an ownership statement', async () => {
    mockHelper.getNotebookCollection.mockResolvedValue({
      id: 'nb-1',
      user_id: 'user-1',
      share_mode: 'authenticated',
      is_public: false,
      settings: {},
    });

    const res = await call({ is_public: true, public_ownership: null });

    expect(res.status).toBe(400);
    expect(mockHelper.updateNotebookCollection).not.toHaveBeenCalled();
  });

  it.each(['owner', 'public_data'])(
    'lists authenticated notebooks with %s ownership in the metadata write',
    async (public_ownership) => {
      mockHelper.getNotebookCollection.mockResolvedValue({
        id: 'nb-1',
        user_id: 'user-1',
        share_mode: 'authenticated',
        is_public: true,
        settings: {},
      });

      expect((await call({ is_public: true, public_ownership })).status).toBe(200);
      expect(mockHelper.updateNotebookCollection).toHaveBeenCalledExactlyOnceWith(
        'nb-1',
        expect.objectContaining({
          name: 'Updated notebook',
          is_public: true,
          public_ownership,
        })
      );
    }
  );

  it('clears ownership when unlisting', async () => {
    expect((await call({ is_public: false, public_ownership: 'owner' })).status).toBe(200);
    expect(mockHelper.updateNotebookCollection).toHaveBeenCalledWith(
      'nb-1',
      expect.objectContaining({
        is_public: false,
        public_ownership: null,
      })
    );
  });

  it.each([{}, { is_public: null, public_ownership: null }])(
    'leaves visibility untouched for metadata-only edits: %j',
    async (patch) => {
      expect((await call(patch)).status).toBe(200);
      const update = mockHelper.updateNotebookCollection.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      expect(update).not.toHaveProperty('is_public');
      expect(update).not.toHaveProperty('public_ownership');
    }
  );

  it('does not let collaborators change visibility through a metadata edit', async () => {
    mockHelper.getNotebookCollection.mockResolvedValue({
      id: 'nb-1',
      user_id: 'other',
      share_mode: 'private',
      is_public: false,
      settings: {},
    });

    expect((await call({ is_public: true, public_ownership: 'owner' })).status).toBe(200);
    const update = mockHelper.updateNotebookCollection.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(update).not.toHaveProperty('is_public');
    expect(update).not.toHaveProperty('public_ownership');
  });
});
