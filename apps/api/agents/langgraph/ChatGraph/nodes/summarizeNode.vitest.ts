/**
 * `summarizeNode` over notebook documents handed over from the reader: a
 * collaborator's document is read with its owner's id, a system document
 * under its collection's default filter — and a very long text is cut at a
 * fixed number of map segments, which the summary then says.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fakeDoc,
  makeSystemDeps,
} from '../../../../services/notebook/__fixtures__/fakeSystemCollection.js';

import type { ChatGraphState, ResolvedNotebookSource } from '../types.js';

const aiText = vi.fn(async (call: { lane: string }) => `summary:${call.lane}`);
vi.mock('../../../../services/ai/generate.js', () => ({ aiText }));

const query = vi.fn();
vi.mock('../../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const LV = 'landesverbaende_documents';
const HH = 'https://gruene-hamburg.de/a';
const system = makeSystemDeps(
  fakeDoc(LV, HH, ['Der Hafen wird klimaneutral.'], { landesverband: 'HH', title: 'Hafen' })
);
const getDocumentChunks = vi.fn(async () => ({
  success: false,
  chunks: [],
  chunkCount: 0,
  error: 'No chunks found',
}));
let serviceKind: 'system' | 'user' = 'system';
vi.mock('../../../../services/document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: () =>
    serviceKind === 'system' ? system.deps.documentService : { getDocumentChunks },
}));

const { summarizeNode } = await import('./summarizeNode.js');

const stateWith = (notebookSources: ResolvedNotebookSource[]): ChatGraphState =>
  ({
    agentConfig: { userId: 'viewer-1' },
    messages: [],
    documentChatIds: [],
    documentIds: [],
    notebookSources,
  }) as unknown as ChatGraphState;

const HAMBURG = {
  key: 'hamburg',
  systemId: 'hamburg-system',
  name: 'Hamburg',
  qdrantCollection: LV,
};

beforeEach(() => {
  aiText.mockClear();
  query.mockReset();
  getDocumentChunks.mockClear();
});

describe('summarizeNode — notebook sources', () => {
  it('reads a system document under the default filter and titles the summary', async () => {
    serviceKind = 'system';
    const out = await summarizeNode(
      stateWith([{ kind: 'system', collection: HAMBURG, sourceUrl: HH, title: 'Hafen' }])
    );
    expect(out.summaryContext).toBe('## Hafen\n\nsummary:chat_summarize');
    expect(system.getSystemDocumentFullTextByUrl.mock.calls[0]![2]).toEqual({
      must: [{ key: 'landesverband', match: { value: 'HH' } }],
    });
  });

  it('reads a collaborator’s document with the owner’s id', async () => {
    serviceKind = 'user';
    query.mockResolvedValue([{ markdown_content: 'Antragstext zum Radweg.' }]);
    const out = await summarizeNode(
      stateWith([
        {
          kind: 'user',
          documentId: 'doc-1',
          notebookId: 'nb-1',
          ownerUserId: 'owner-1',
          title: 'Radweg',
        },
      ])
    );
    expect(out.summaryContext).toBe('## Radweg\n\nsummary:chat_summarize');
    expect(getDocumentChunks).toHaveBeenCalledWith('owner-1', 'doc-1');
    expect(aiText.mock.calls[0]![0]).toMatchObject({ prompt: expect.stringContaining('Radweg') });
  });

  it('says so when one of the documents could not be read', async () => {
    serviceKind = 'system';
    const out = await summarizeNode(
      stateWith([
        { kind: 'system', collection: HAMBURG, sourceUrl: HH, title: 'Hafen' },
        {
          kind: 'system',
          collection: HAMBURG,
          sourceUrl: 'https://gruene-hamburg.de/weg',
          title: 'Weg',
        },
      ])
    );
    expect(out.summaryContext).toBe('## Hafen\n\nsummary:chat_summarize');
    expect(out.degradationNotes?.map((n) => n.code)).toEqual(['summary_partial']);
  });

  it('adds no note when every document was read', async () => {
    serviceKind = 'system';
    const out = await summarizeNode(
      stateWith([{ kind: 'system', collection: HAMBURG, sourceUrl: HH, title: 'Hafen' }])
    );
    expect(out.degradationNotes).toBeUndefined();
  });

  it('caps the map phase and says the summary covers only the beginning', async () => {
    serviceKind = 'user';
    query.mockResolvedValue([{ markdown_content: 'x'.repeat(250_000) }]);
    const out = await summarizeNode(
      stateWith([
        {
          kind: 'user',
          documentId: 'doc-1',
          notebookId: null,
          ownerUserId: 'viewer-1',
          title: 'Protokoll',
        },
      ])
    );
    const mapCalls = aiText.mock.calls.filter(([c]) => c.lane === 'chat_summarize_map');
    expect(mapCalls).toHaveLength(20);
    expect(out.summaryContext).toMatch(
      /Hinweis: Nur die ersten 116\.200 von 250\.000 Zeichen des Dokuments wurden zusammengefasst\.$/
    );
  });
});
