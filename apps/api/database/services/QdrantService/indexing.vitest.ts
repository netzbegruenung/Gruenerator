/**
 * Der Bundestag-Pfad war die Stelle, an der die Strukturfelder auf den Boden
 * fielen: der Chunker liefert sie, `BundestagScraper` reichte sie nicht weiter,
 * und `indexBundestagContent` schrieb sie nicht ins Payload. Ein Punkt dieser
 * Sammlung trug damit `heading_path: undefined` statt des Abschnitts, aus dem
 * er stammt.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./operations/batchOperations.js', () => ({
  enrichPointsWithBm25: vi.fn(
    async (_client: unknown, _collection: string, points: unknown[]) => points
  ),
}));

import { indexBundestagContent } from './indexing.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

function fakeClient(): { client: QdrantClient; upserted: Array<Record<string, unknown>> } {
  const upserted: Array<Record<string, unknown>> = [];
  const client = {
    upsert: vi.fn(async (_collection: string, body: { points: Array<Record<string, unknown>> }) => {
      upserted.push(...body.points);
    }),
  } as unknown as QdrantClient;
  return { client, upserted };
}

describe('indexBundestagContent', () => {
  it('schreibt die Strukturfelder eines Chunks ins Payload', async () => {
    const { client, upserted } = fakeClient();

    await indexBundestagContent(
      client,
      'bundestag_content',
      'https://example.org/a',
      [
        {
          embedding: [0.1, 0.2],
          text: '## 3.1 Förderung\n\nEin Satz.',
          metadata: {
            headingPath: ['Kapitel 3', '3.1 Förderung'],
            heading: '3.1 Förderung',
            chunkType: 'text',
            sectionIndex: 2,
          },
        },
      ],
      { title: 'Antrag' }
    );

    expect(upserted).toHaveLength(1);
    expect(upserted[0].payload).toMatchObject({
      heading_path: ['Kapitel 3', '3.1 Förderung'],
      heading: '3.1 Förderung',
      chunk_type: 'text',
      section_index: 2,
    });
  });

  it('schreibt für einen Chunk ohne Metadaten die leeren Strukturfelder', async () => {
    const { client, upserted } = fakeClient();

    await indexBundestagContent(client, 'bundestag_content', 'https://example.org/b', [
      { embedding: [0.1], text: 'Fließtext.' },
    ]);

    expect(upserted[0].payload).toMatchObject({
      heading_path: null,
      heading: null,
      chunk_type: 'text',
      section_index: null,
    });
  });

  it('erkennt einen Tabellen-Chunk als solchen', async () => {
    const { client, upserted } = fakeClient();

    await indexBundestagContent(client, 'bundestag_content', 'https://example.org/c', [
      { embedding: [0.1], text: '| a | b |', metadata: { chunkType: 'table' } },
    ]);

    expect((upserted[0].payload as { chunk_type: string }).chunk_type).toBe('table');
  });

  /**
   * #3224: ohne dieses Feld sind Vektoren aus zwei Modellen in derselben
   * Sammlung nicht unterscheidbar, ein Modellwechsel also weder prüfbar noch
   * teilweise reparierbar. Es hängt an keinem Chunk-Feld, sondern an der
   * Konstante des einzigen Einbettungs-Backends — deshalb muss es auch auf
   * einem Chunk ganz ohne Metadaten stehen.
   */
  it('schreibt das Einbettungsmodell in jedes Payload, auch ohne Chunk-Metadaten', async () => {
    const { client, upserted } = fakeClient();

    await indexBundestagContent(client, 'bundestag_content', 'https://example.org/d', [
      { embedding: [0.1], text: 'Mit Metadaten.', metadata: { chunkType: 'table' } },
      { embedding: [0.2], text: 'Ohne Metadaten.' },
    ]);

    expect(upserted).toHaveLength(2);
    for (const point of upserted) {
      expect(point.payload).toMatchObject({ embedding_model: 'mistral-embed' });
    }
  });

  /**
   * #3223: mit den Offsets lässt sich eine Fundstelle im Quelldokument
   * markieren statt nur die Seite zu nennen. Ein Chunk ohne auffindbare
   * Position trägt zweimal `null` — nie ein halbes Paar, das eine Sprungmarke
   * ins Leere laufen ließe.
   */
  it('schreibt die Zeichen-Offsets ins Payload und für einen Chunk ohne sie null', async () => {
    const { client, upserted } = fakeClient();

    await indexBundestagContent(client, 'bundestag_content', 'https://example.org/e', [
      {
        embedding: [0.1],
        text: 'Mit Position.',
        metadata: { startPosition: 120, endPosition: 1580 },
      },
      { embedding: [0.2], text: 'Ohne Position.' },
    ]);

    expect(upserted[0].payload).toMatchObject({ char_start: 120, char_end: 1580 });
    expect(upserted[1].payload).toMatchObject({ char_start: null, char_end: null });
  });
});
