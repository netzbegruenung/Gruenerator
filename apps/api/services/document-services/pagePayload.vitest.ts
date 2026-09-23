/**
 * Seitenzahlen von der Extraktion bis zum Leser: ein Text mit `## Seite N`
 * wird zerlegt, gespeichert, zurückgelesen — und `seite` findet die Seite.
 * Ein Text ohne Marken bekommt keine Seiten, auch wenn er „Seite 3" erwähnt.
 */
import { describe, it, expect, vi } from 'vitest';

import { pickRange } from '../../routes/chat/agents/notebookSourceRange.js';
import { readSourceText } from '../notebook/notebookSources.js';

import { getDocumentChunks } from './DocumentSearchService/documentRetrieval.js';
import { storeDocumentVectors } from './DocumentSearchService/vectorOperations.js';
import { pagePayload } from './pagePayload.js';
import { smartChunkDocument } from './TextChunker/index.js';

import type { QdrantOperations } from '../../database/services/QdrantOperations.js';

const para = (word: string) =>
  `${word} ist ein Satz über die Wärmewende in der Kommune. `.repeat(8);

const MARKED = [
  '## Seite 1',
  '',
  para('Seite-eins-Inhalt'),
  '',
  '## Seite 2',
  '',
  para('Seite-zwei-Inhalt'),
  '',
  '## Seite 4',
  '',
  para('Seite-vier-Inhalt'),
].join('\n');

// Beginnt ein Chunk mit „Seite 3 …", riet der alte Rückfall daraus Seite 3.
const PLAIN = ['Seite 3 des Antrags regelt die Finanzierung.', '', para('Fließtext')].join('\n');

/** Speichert über den echten Upsert und liest über den echten Chunk-Abruf zurück. */
async function roundTrip(text: string) {
  const chunks = await smartChunkDocument(text, { preserveSentences: true });
  const stored: Array<{ id: number; payload: Record<string, unknown> }> = [];
  const ops = {
    batchUpsert: vi.fn(async (_c: string, points: typeof stored) => {
      stored.push(...points);
    }),
    scrollDocuments: vi.fn(async () => stored),
  } as unknown as QdrantOperations;

  await storeDocumentVectors(
    ops,
    'user-1',
    'doc-1',
    chunks,
    chunks.map(() => [0.1]),
    { sourceType: 'manual', title: 'Antrag' }
  );

  const source = await readSourceText(
    { sourceId: 'doc-1', ownerUserId: 'user-1' },
    {
      db: { query: vi.fn(async () => [{ markdown_content: text }]) } as never,
      documentService: {
        getDocumentChunks: (userId: string, documentId: string) =>
          getDocumentChunks(ops, userId, documentId),
      } as never,
    }
  );
  return { stored, source };
}

describe('Seitenzahlen: Marke → Chunk → Qdrant-Payload → Leser', () => {
  it('schreibt page_number je Chunk aus den Marken', async () => {
    const { stored } = await roundTrip(MARKED);
    const pages = stored.map((p) => p.payload.page_number);
    expect(new Set(pages)).toEqual(new Set([1, 2, 4]));
    for (const p of stored) {
      const text = p.payload.chunk_text as string;
      if (text.includes('Seite-zwei-Inhalt')) expect(p.payload.page_number).toBe(2);
      if (text.includes('Seite-vier-Inhalt')) expect(p.payload.page_number).toBe(4);
    }
  });

  it('pickRange `seite` trifft genau die Seite im Originaltext', async () => {
    const { source } = await roundTrip(MARKED);
    expect(source.origin).toBe('original');

    const range = pickRange({ seite: 4 }, source.chunkMap, source.chunks);
    if ('error' in range) throw new Error(range.error);
    const slice = source.text.slice(range.von, range.von + (range.zeichen ?? 0));
    expect(slice).toContain('Seite-vier-Inhalt');
    expect(slice).not.toContain('Seite-zwei-Inhalt');

    const missing = pickRange({ seite: 3 }, source.chunkMap, source.chunks);
    expect(missing).toEqual({ error: 'Seite 3 gibt es nicht (Seiten 1–4).' });
  });

  it('erfindet ohne Marken keine Seite — auch nicht aus „Seite 3" im Text', async () => {
    const { stored, source } = await roundTrip(PLAIN);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((p) => p.payload.page_number === null)).toBe(true);

    const range = pickRange({ seite: 3 }, source.chunkMap, source.chunks);
    expect(range).toEqual({ error: expect.stringContaining('keine Seitenzahlen') });
  });
});

describe('pagePayload', () => {
  it('nimmt nur ganze positive Zahlen', () => {
    expect(pagePayload({ metadata: { page_number: 3 } })).toEqual({ page_number: 3 });
    expect(pagePayload({ metadata: { page_number: null } })).toEqual({ page_number: null });
    expect(pagePayload({ metadata: { page_number: 0 } })).toEqual({ page_number: null });
    expect(pagePayload({})).toEqual({ page_number: null });
  });
});
