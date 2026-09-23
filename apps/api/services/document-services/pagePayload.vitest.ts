/**
 * Seitenzahlen von der Extraktion bis zum Leser: ein Text mit `## Seite N`
 * wird zerlegt, gespeichert, zurückgelesen — und `seite` findet die Seite.
 * Ein Text ohne Marken bekommt keine Seiten, auch wenn er „Seite 3" erwähnt.
 */
import { describe, it, expect, vi } from 'vitest';

import { pickRange } from '../../routes/chat/agents/notebookSourceRange.js';
import { outlineSource, readSourceText } from '../notebook/notebookSources.js';

import { getDocumentChunks } from './DocumentSearchService/documentRetrieval.js';
import { storeDocumentVectors } from './DocumentSearchService/vectorOperations.js';
import { pagePayload } from './pagePayload.js';
import { smartChunkDocument } from './TextChunker/index.js';

import type { QdrantOperations } from '../../database/services/QdrantOperations.js';

// Eine Seite länger als ein Chunk (1600 Zeichen), wie auf echten PDF-Seiten:
// die Seite eines Chunks ist die Seite, auf der er BEGINNT.
const para = (word: string) =>
  `${word} ist ein Satz über die Wärmewende in der Kommune. `.repeat(40);

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
    // Die Seite eines Chunks ist die, auf der sein erstes Wort steht.
    for (const p of stored) {
      const text = p.payload.chunk_text as string;
      if (text.startsWith('Seite-eins-Inhalt')) expect(p.payload.page_number).toBe(1);
      if (text.startsWith('Seite-zwei-Inhalt')) expect(p.payload.page_number).toBe(2);
      if (text.startsWith('Seite-vier-Inhalt')) expect(p.payload.page_number).toBe(4);
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

// Ein Abschnitt, der über eine Seitengrenze läuft: die Überschrift steht auf
// Seite 1, ihr Text geht auf Seite 2 weiter. Seitenweises Zerlegen verlor dort
// den Überschriftenpfad, zählte die Abschnitte je Seite neu und erzeugte je
// Seite einen Gliederungseintrag ohne Überschrift.
const SPANNING = [
  '## Seite 1',
  '',
  '# Wärmeplanung',
  '',
  para('Anfang-der-Wärmeplanung'),
  '',
  '## Seite 2',
  '',
  para('Fortsetzung-der-Wärmeplanung'),
  '',
  '# Mobilität',
  '',
  para('Radwege-Inhalt'),
].join('\n');

describe('Seitenzahlen über Abschnittsgrenzen hinweg', () => {
  it('behält Überschrift und Abschnitt über die Seitengrenze', async () => {
    const { stored } = await roundTrip(SPANNING);
    const cont = stored.find((p) =>
      (p.payload.chunk_text as string).startsWith('Fortsetzung-der-Wärmeplanung')
    );
    const start = stored.find((p) =>
      (p.payload.chunk_text as string).includes('Anfang-der-Wärmeplanung')
    );
    expect(cont?.payload.heading_path).toEqual(['Wärmeplanung']);
    expect(cont?.payload.section_index).toBe(start?.payload.section_index);
    expect(start?.payload.page_number).toBe(1);
    expect(cont?.payload.page_number).toBe(2);
  });

  it('Gliederung ohne Phantom-Abschnitte, section liest den richtigen Text', async () => {
    const { source } = await roundTrip(SPANNING);
    const outline = outlineSource(source.chunks);
    expect(outline.map((e) => e.heading)).toEqual(['Wärmeplanung', 'Mobilität']);
    expect(outline[0]).toMatchObject({ pageFrom: 1, pageTo: 2 });

    const section = outline[0].sectionIndex as number;
    const range = pickRange({ section }, source.chunkMap, source.chunks);
    if ('error' in range) throw new Error(range.error);
    const slice = source.text.slice(range.von, range.von + (range.zeichen ?? 0));
    expect(slice).toContain('Anfang-der-Wärmeplanung');
    expect(slice).toContain('Fortsetzung-der-Wärmeplanung');
    expect(slice).not.toContain('Radwege-Inhalt');
  });

  it('Offsets zeigen in den gespeicherten Rohtext samt Marken', async () => {
    const { stored } = await roundTrip(SPANNING);
    for (const p of stored) {
      const { char_start: from, char_end: to } = p.payload as {
        char_start: number;
        char_end: number;
      };
      expect(typeof from).toBe('number');
      const raw = SPANNING.slice(from, to).replace(/\s+/g, '');
      const firstWord = (p.payload.chunk_text as string).split(/\s+/)[0].replace(/\s+/g, '');
      expect(raw.startsWith(firstWord)).toBe(true);
    }
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
