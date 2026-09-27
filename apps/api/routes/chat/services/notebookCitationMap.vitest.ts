/**
 * Der Präzisionsmodus zitiert mit den Chat-Zitaten des Loops, die
 * Notebook-Seite liest aber die Notebook-Form (`index`, snake_case). Der
 * Rundlauf gegen den Client-Mapper `mapRawCitationsToChat` ist die Probe:
 * was hier hinausgeht, muss dort wieder als dieselbe Chat-Karte ankommen.
 */
import { notebookCitationSchema, notebookSourceSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { mapRawCitationsToChat } from '../../../../../packages/chat/src/lib/citationUtils.js';

import { toNotebookCitations, toNotebookSources } from './notebookCitationMap.js';

import type { Citation } from '../../../agents/langgraph/ChatGraph/types.js';

const CITATIONS: Citation[] = [
  {
    id: 1,
    title: 'Antrag Radweg',
    url: '',
    snippet: 'Der Radweg kommt 2027.',
    citedText: 'Der Radweg kommt 2027.',
    source: 'Kreisverband',
    collectionName: 'Kreisverband',
    collectionId: 'n1',
    documentId: 'd1',
    chunkIndex: 1,
    similarityScore: 0.82,
    pageNumber: 2,
  },
  {
    id: 2,
    title: 'Antrag Radweg',
    url: '',
    snippet: 'Anhang mit Zahlen.',
    source: 'Kreisverband',
    collectionName: 'Kreisverband',
    collectionId: 'n1',
    documentId: 'd1',
    chunkIndex: 2,
    similarityScore: 0.5,
    pageNumber: null,
  },
  {
    id: 3,
    title: 'Radverkehr',
    url: 'https://gruene-hamburg.de/a',
    snippet: 'Hamburg baut Radwege.',
    source: 'Landesverband Hamburg',
    collectionName: 'Landesverband Hamburg',
    collectionId: 'hamburg',
  },
];

describe('toNotebookCitations', () => {
  it('produces the notebook wire shape', () => {
    for (const c of toNotebookCitations(CITATIONS)) {
      expect(notebookCitationSchema.safeParse(c).success).toBe(true);
    }
  });

  it('round-trips through the client mapper', () => {
    const back = mapRawCitationsToChat(toNotebookCitations(CITATIONS));
    expect(back).toHaveLength(CITATIONS.length);
    back.forEach((chat, i) => {
      const orig = CITATIONS[i]!;
      expect(chat.id).toBe(orig.id);
      expect(chat.title).toBe(orig.title);
      expect(chat.url).toBe(orig.url);
      expect(chat.snippet).toBe(orig.citedText ?? orig.snippet);
      expect(chat.source).toBe(orig.source);
      expect(chat.collectionName).toBe(orig.collectionName);
      expect(chat.collectionId).toBe(orig.collectionId);
      expect(chat.documentId).toBe(orig.documentId);
      expect(chat.chunkIndex).toBe(orig.chunkIndex);
      expect(chat.similarityScore).toBe(orig.similarityScore);
      expect(chat.pageNumber).toBe(orig.pageNumber ?? null);
    });
  });

  it('falls back to source as collection name', () => {
    const [c] = toNotebookCitations([
      { id: 4, title: 'T', url: '', snippet: 's', source: 'Notebook X' },
    ]);
    expect(c!.collection_name).toBe('Notebook X');
  });
});

describe('toNotebookSources', () => {
  it('groups citations per document, like the notebook pipeline', () => {
    const sources = toNotebookSources(toNotebookCitations(CITATIONS));
    expect(sources).toHaveLength(2);
    for (const s of sources) expect(notebookSourceSchema.safeParse(s).success).toBe(true);
    const radweg = sources.find((s) => s.document_id === 'd1')!;
    expect(radweg.citations.map((c) => c.index)).toEqual(['1', '2']);
    expect(radweg.similarity_score).toBe(0.82);
    expect(radweg.chunk_text).toBe('Der Radweg kommt 2027. [...] Anhang mit Zahlen.');
    const hh = sources.find((s) => s.document_title === 'Radverkehr')!;
    expect(hh.source_url).toBe('https://gruene-hamburg.de/a');
  });
});
