/**
 * #3255: getMultipleDocumentsFullText hat ein BEWUSSTES Budget
 * (`documentIds.length * 20` Punkte für alle Dokumente zusammen) — es füttert
 * LLM-Kontext-Pfade, dort ist ein Deckel gewollt. Aber der Deckel war
 * unsichtbar: der Scroll ist unsortiert, ein großes Dokument kann einem
 * anderen das Budget wegnehmen und dabei MITTLERE Chunks verlieren, und das
 * Ergebnis sah aus wie eine vollständige Rekonstruktion. `capped` macht den
 * Schnitt sichtbar, ohne die Budget-Entscheidung zu ändern.
 */
import { describe, expect, it, vi } from 'vitest';

import { getMultipleDocumentsFullText } from './documentRetrieval.js';

import type { QdrantFilter } from './types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

function opsWithPoints(total: number) {
  const points = Array.from({ length: total }, (_, i) => ({
    id: `p${i}`,
    payload: { document_id: 'doc-1', chunk_index: i, chunk_text: `Text ${i}` },
  }));
  const scrollDocuments = vi.fn(
    async (_collection: string, _filter: QdrantFilter, opts: { limit: number }) =>
      points.slice(0, opts.limit)
  );
  return { ops: { scrollDocuments } as unknown as QdrantOperations };
}

describe('getMultipleDocumentsFullText — Budget-Signal', () => {
  it('meldet capped: true, wenn der Scroll sein Limit ausschöpft', async () => {
    // 1 Dokument → Limit 20 Punkte; das Dokument hat mehr.
    const { ops } = opsWithPoints(50);

    const result = await getMultipleDocumentsFullText(ops, 'user-1', ['doc-1']);

    expect(result.capped).toBe(true);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.chunkCount).toBe(20);
  });

  it('meldet capped: false, wenn alle Chunks ins Budget passen', async () => {
    const { ops } = opsWithPoints(5);

    const result = await getMultipleDocumentsFullText(ops, 'user-1', ['doc-1']);

    expect(result.capped).toBe(false);
    expect(result.documents[0]?.chunkCount).toBe(5);
  });

  it('meldet capped: false, wenn die Punkte das Budget exakt füllen', async () => {
    // Exakt volles Budget heißt: nichts fehlt. Der Überhang-Abruf
    // (pointBudget + 1) unterscheidet diesen Fall vom echten Schnitt.
    const { ops } = opsWithPoints(20);

    const result = await getMultipleDocumentsFullText(ops, 'user-1', ['doc-1']);

    expect(result.capped).toBe(false);
    expect(result.documents[0]?.chunkCount).toBe(20);
  });

  it('meldet capped: false auf dem Fehlerpfad ohne Treffer', async () => {
    const { ops } = opsWithPoints(0);

    const result = await getMultipleDocumentsFullText(ops, 'user-1', ['doc-1']);

    expect(result.capped).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
