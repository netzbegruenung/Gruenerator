/**
 * #3255: getDocumentFullText rekonstruierte mit einem einzelnen
 * `limit: 1000`-Scroll — ein Dokument mit mehr Punkten kam still gekürzt
 * zurück, mit `success: true` und ohne Fehlersignal. Seit dem Umbau läuft
 * es über dieselbe Cursor-Schleife wie getDocumentChunks und
 * inspectDocumentChunks (256er-Seiten, inklusiver Offset).
 */
import { describe, expect, it, vi } from 'vitest';

import { getDocumentFullText } from './documentRetrieval.js';

import type { QdrantFilter } from './types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

function opsWithPoints(total: number) {
  const points = Array.from({ length: total }, (_, i) => ({
    id: `p${i}`,
    payload: { chunk_index: i, chunk_text: `Text ${i}`, token_count: 1 },
  }));
  const scrollDocuments = vi.fn(
    async (
      _collection: string,
      _filter: QdrantFilter,
      opts: { limit: number; offset?: string | number | null }
    ) => {
      const start = opts.offset == null ? 0 : points.findIndex((p) => p.id === opts.offset);
      // Qdrants Scroll-Offset ist eine Punkt-ID und inklusiv: der
      // Cursor-Punkt kommt als erstes Element der nächsten Seite noch einmal.
      return points.slice(start, start + opts.limit);
    }
  );
  return { ops: { scrollDocuments } as unknown as QdrantOperations, scrollDocuments };
}

describe('getDocumentFullText — seitenweiser Scroll', () => {
  it('rekonstruiert Dokumente mit mehr als 1000 Punkten vollständig', async () => {
    const TOTAL = 1100;
    const { ops, scrollDocuments } = opsWithPoints(TOTAL);

    const result = await getDocumentFullText(ops, 'user-1', 'doc-1');

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBe(TOTAL);
    expect(result.fullText.startsWith('Text 0\n\n')).toBe(true);
    expect(result.fullText.endsWith(`Text ${TOTAL - 1}`)).toBe(true);
    expect(scrollDocuments.mock.calls.length).toBeGreaterThan(1);
  });

  it('meldet weiterhin einen Fehler, wenn kein Chunk existiert', async () => {
    const { ops } = opsWithPoints(0);

    const result = await getDocumentFullText(ops, 'user-1', 'doc-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('No chunks found for document');
  });
});
