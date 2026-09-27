import { describe, it, expect } from 'vitest';

import { BaseSearchService } from './BaseSearchService.js';

import type { TransformedChunk } from './types.js';

/**
 * Die Trefferkarte der manuellen Recherche zeigt Art und Herkunft eines
 * Landesverband-Dokuments („Beschluss“, „Grüne Fraktion Berlin“). Die Werte
 * liegen auf jedem Chunk; das Dokument nimmt sie vom ersten Chunk, der sie
 * trägt — auch wenn der erste gruppierte Chunk sie nicht hat.
 */
const chunk = (index: number, labels: Partial<TransformedChunk> = {}): TransformedChunk =>
  ({
    id: `doc-c${index}`,
    document_id: 'doc',
    documents: { id: 'doc', title: 'Hitzeschutz für alle', filename: '' },
    chunk_index: index,
    chunk_text: `Abschnitt ${index} über Hitzeschutz.`,
    similarity: 0.8,
    ...labels,
  }) as unknown as TransformedChunk;

const svc = () => new BaseSearchService({ serviceName: 'Test' });

describe('document labels', () => {
  it('trägt Art und Herkunft vom Chunk ins Dokument', async () => {
    const [doc] = await svc().groupAndRankHybridResults(
      [
        chunk(0),
        chunk(1, { content_type_label: 'Beschluss', source_name: 'Grüne Fraktion Berlin' }),
      ],
      10,
      'Hitzeschutz',
      {}
    );

    expect(doc?.content_type_label).toBe('Beschluss');
    expect(doc?.source_name).toBe('Grüne Fraktion Berlin');
  });

  it('bleibt null, wo die Sammlung keine Beschriftung schreibt', async () => {
    const [doc] = await svc().groupAndRankHybridResults([chunk(0)], 10, 'Hitzeschutz', {});

    expect(doc?.content_type_label).toBeNull();
    expect(doc?.source_name).toBeNull();
  });
});
