/**
 * Der Vorab-Seed für gewählte Wolke- und Connect-Dateien.
 *
 * Live 02.11.2026: eine aus der Wolke gewählte Datei erzwang `search`, der Turn
 * lief aber als Loop — und dort las niemand die Datei. `retrievableAttachedSources`
 * lässt `wolke`/`connect` bewusst aus, und `cloud_files` kannte den Pfad nicht.
 * Das Modell suchte stattdessen im Grünerator-Index und fasste zwei
 * Wahlprogramme zusammen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { seedAttachedCloudFiles } from './catalogAssembly.js';
import { createSourceRegistry } from './sourceRegistry.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

const fanout = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../agents/langgraph/ChatGraph/nodes/searchNode.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  executeMultiDocFanout: (...a: unknown[]) => fanout(...a),
}));

const wolkeSource = {
  kind: 'wolke',
  id: 'wolke:link-1:/Protokoll.docx',
  label: 'Protokoll.docx',
  wolke: { shareLinkId: 'link-1', path: '/Protokoll.docx', name: 'Protokoll.docx' },
};

const stateWith = (over: Record<string, unknown> = {}) =>
  ({
    intent: 'search',
    documentSources: [wolkeSource],
    searchQuery: 'Zusammenfassung',
    lastUserTextNoMentions: 'Fasse das Dokument zusammen.',
    agentConfig: { userId: 'u1' },
    ...over,
  }) as unknown as ChatGraphState;

const hit = {
  source: 'wolke:link-1:/Protokoll.docx',
  title: 'Protokoll.docx',
  content: 'Der Stadtverband beschließt eine Stadtteilversammlung.',
  relevance: 0.7,
  documentSourceId: wolkeSource.id,
};

const run = (state: ChatGraphState, isMounted = true) => {
  const sourceRegistry = createSourceRegistry();
  return seedAttachedCloudFiles({
    state,
    sourceRegistry,
    isMounted,
    onInfo: () => {},
    onError: () => {},
  }).then((seeded) => ({ ...seeded, sourceRegistry }));
};

describe('seedAttachedCloudFiles', () => {
  beforeEach(() => fanout.mockReset());

  it('liest die gewählte Wolke-Datei vorab und gibt sie Schreiber und Planer', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { [wolkeSource.id]: [hit] },
      searchedCollections: [],
      errors: [],
    });

    const { replay, delivered, sourceRegistry } = await run(stateWith());

    expect(fanout).toHaveBeenCalledWith(
      'Zusammenfassung',
      [wolkeSource],
      expect.anything(),
      expect.anything()
    );
    expect(delivered).toBe(true);
    expect(sourceRegistry.renderAll()).toContain('Stadtteilversammlung');
    expect(replay[0]).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolName: 'cloud_files',
          input: { action: 'read', connectionId: 'link-1', path: '/Protokoll.docx' },
        },
      ],
    });
    expect(JSON.stringify(replay[1])).toContain('Stadtteilversammlung');
  });

  it('trägt ohne montiertes cloud_files nur in die Registry ein', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { [wolkeSource.id]: [hit] },
      searchedCollections: [],
      errors: [],
    });

    const { replay, delivered, sourceRegistry } = await run(stateWith(), false);

    expect(delivered).toBe(true);
    expect(replay).toEqual([]);
    expect(sourceRegistry.renderAll()).toContain('Stadtteilversammlung');
  });

  it('liest auch eine Connect-Datei, ohne sie als cloud_files auszugeben', async () => {
    const connectSource = {
      kind: 'connect',
      id: 'connect:google-drive:f1',
      label: 'Satzung.pdf',
      connect: { provider: 'google-drive', fileId: 'f1', name: 'Satzung.pdf' },
    };
    fanout.mockResolvedValue({
      perSourceResults: {
        [connectSource.id]: [{ ...hit, title: 'Satzung.pdf', documentSourceId: connectSource.id }],
      },
      searchedCollections: [],
      errors: [],
    });

    const { replay, delivered } = await run(stateWith({ documentSources: [connectSource] }));

    expect(delivered).toBe(true);
    expect(replay).toEqual([]);
  });

  it('meldet dem Planer, wenn die Datei nicht lesbar war', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { [wolkeSource.id]: [] },
      searchedCollections: [],
      errors: [{ source: `wolke:${wolkeSource.id}`, message: 'Download fehlgeschlagen' }],
    });

    const { replay, delivered } = await run(stateWith());

    expect(delivered).toBe(false);
    expect(JSON.stringify(replay[1])).toContain('Download fehlgeschlagen');
  });

  it('meldet jede Datei ohne Text als unlesbar, unabhängig vom Mount', async () => {
    const second = { ...wolkeSource, id: 'wolke:link-1:/Haushalt.pdf', label: 'Haushalt.pdf' };
    fanout.mockResolvedValue({
      perSourceResults: { [wolkeSource.id]: [hit], [second.id]: [] },
      searchedCollections: [],
      errors: [],
    });

    const { delivered, unreadable } = await run(
      stateWith({ documentSources: [wolkeSource, second] }),
      false
    );

    expect(delivered).toBe(true);
    expect(unreadable).toEqual([{ label: 'Haushalt.pdf', reason: null }]);
  });

  it('meldet bei einem geworfenen Abruf alle Dateien als unlesbar', async () => {
    fanout.mockImplementationOnce(async () => {
      throw new Error('Verbindung weg');
    });

    const { delivered, unreadable } = await run(stateWith());

    expect(delivered).toBe(false);
    expect(unreadable).toEqual([{ label: 'Protokoll.docx', reason: 'Verbindung weg' }]);
  });

  it('meldet keine Datei als unlesbar, wenn erst die Registrierung wirft', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { [wolkeSource.id]: [hit] },
      searchedCollections: [],
      errors: [],
    });
    const sourceRegistry = createSourceRegistry();
    sourceRegistry.seedAttached = () => {
      throw new Error('Registry kaputt');
    };

    const { delivered, unreadable } = await seedAttachedCloudFiles({
      state: stateWith(),
      sourceRegistry,
      isMounted: true,
      onInfo: () => {},
      onError: () => {},
    });

    expect(delivered).toBe(false);
    expect(unreadable).toEqual([]);
  });

  it('liest eine mitgeführte Datei auch auf einem Loop-Turn mit — ob er sie braucht, entscheidet das Modell', async () => {
    fanout.mockResolvedValue({
      perSourceResults: { [wolkeSource.id]: [hit] },
      searchedCollections: [],
      errors: [],
    });
    const { delivered } = await run(stateWith({ cloudFilesCarriedOnly: true, intent: 'agentic' }));

    expect(delivered).toBe(true);
    expect(fanout).toHaveBeenCalledOnce();
  });

  it('liest ein Foto nie per OCR vor (live 06.11.2026: 3 Zeichen in 3 s je Turn)', async () => {
    const photo = { ...wolkeSource, id: 'wolke:link:/IMG_2601 (1).jpg', label: 'IMG_2601 (1).jpg' };
    const { delivered, unreadable } = await run(stateWith({ documentSources: [photo] }));

    expect(delivered).toBe(false);
    expect(unreadable).toEqual([]);
    expect(fanout).not.toHaveBeenCalled();
  });

  it('tut ohne gewählte Cloud-Datei nichts', async () => {
    const { replay, delivered } = await run(
      stateWith({ documentSources: [{ kind: 'document_chat', id: 'd', label: 'x.pdf' }] })
    );

    expect(delivered).toBe(false);
    expect(replay).toEqual([]);
    expect(fanout).not.toHaveBeenCalled();
  });
});
