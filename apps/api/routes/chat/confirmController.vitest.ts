import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PendingAction } from '../../agents/langgraph/ChatGraph/types.js';

const repo = vi.hoisted(() => ({
  shareTextFormWithGroup: vi.fn(),
}));
vi.mock('../../services/user/textFormRepository.js', () => repo);
vi.mock('./services/pendingActionStore.js', () => ({ pendingActionStore: {} }));
vi.mock('./services/threadPersistenceService.js', () => ({}));
const pg = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: () => pg }));
const docContent = vi.hoisted(() => ({ replaceDocumentHtml: vi.fn() }));
vi.mock('../../services/docs/docContentService.js', () => docContent);

const { executeAction } = await import('./confirmController.js');

const action: PendingAction = {
  actionId: 'a1',
  threadId: 't1',
  userId: 'u1',
  title: 'Rezept teilen',
  preview: '',
  createdAt: 0,
  type: 'share_text_form',
  payload: { mention: 'einladung', title: 'Einladung', groupId: 'g1', groupName: 'OV Mitte' },
};

// Die Hochstufung von `private` auf `groups` sitzt in `shareTextFormWithGroup`
// (#3803) — hier bleibt nur, wie die Aktion dessen Ergebnis deutet.
describe('share_text_form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shares through the repository and links the project', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue([{ groupId: 'g1' }]);

    const result = await executeAction(action);

    expect(repo.shareTextFormWithGroup).toHaveBeenCalledWith('u1', 'einladung', 'g1');
    expect(result.url).toBe('/gruppen/g1');
  });

  it('refuses a recipe that is missing or not shareable', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue(null);

    await expect(executeAction(action)).rejects.toThrow('Rezept nicht gefunden');
  });

  it('refuses when the caller is not a member of the project', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue([]);

    await expect(executeAction(action)).rejects.toThrow('nicht Mitglied');
  });
});

// modify_doc schreibt BlockNote-HTML. Ein Deck, eine Tabelle oder ein Board
// hat ein eigenes Modell; ein @doc-Pick auf eine Präsentation (#4895) darf es
// nicht mit Text überschreiben und „aktualisiert" melden.
describe('modify_doc', () => {
  const modify: PendingAction = {
    actionId: 'a2',
    threadId: 't1',
    userId: 'u1',
    title: 'Dokument aktualisieren',
    preview: '',
    createdAt: 0,
    type: 'modify_doc',
    payload: { docId: 'p1', newContent: '<p>Neu</p>' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses to overwrite a presentation with text', async () => {
    pg.query.mockResolvedValue([
      { created_by: 'u1', permissions: null, document_subtype: 'presentations' },
    ]);

    await expect(executeAction(modify)).rejects.toThrow('Präsentationen');
    expect(docContent.replaceDocumentHtml).not.toHaveBeenCalled();
  });

  it('writes a text document', async () => {
    pg.query.mockResolvedValue([{ created_by: 'u1', permissions: null, document_subtype: 'docs' }]);
    docContent.replaceDocumentHtml.mockResolvedValue({ html: '<p>Neu</p>', live: true });

    const result = await executeAction(modify);

    expect(docContent.replaceDocumentHtml).toHaveBeenCalledWith('p1', '<p>Neu</p>', {
      userId: 'u1',
    });
    expect(result.url).toBe('/document/p1');
  });
});
