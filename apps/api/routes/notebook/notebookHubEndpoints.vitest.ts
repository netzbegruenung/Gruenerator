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
  checkNotebookAccess: vi.fn(),
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
