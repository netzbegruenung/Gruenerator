import { describe, expect, it } from 'vitest';

import { applyMMRSelection } from './scoring.js';

import type { DocumentResult } from './types.js';

const doc = (id: string, score: number, text: string, vorgang_id?: string): DocumentResult => ({
  document_id: id,
  relevant_content: text,
  similarity_score: score,
  dense_similarity_score: null,
  max_similarity: score,
  avg_similarity: score,
  top_chunks: [],
  chunk_count: 1,
  term_chunk_count: 0,
  relevance_info: '',
  ...(vorgang_id ? { vorgang_id } : {}),
});

const results = (v1?: string, v2?: string) => [
  doc('gesetz', 0.9, 'Informationssicherheitsgesetz Landesverwaltung Cybersicherheit', v1),
  doc('aenderung', 0.89, 'Änderungsantrag Hochschulen Forschung Digitalisierung Förderung', v2),
  doc('anderes', 0.85, 'Antrag Radverkehr Infrastruktur Landstraßen Finanzierung', 'other'),
  doc('schwach', 0.5, 'Kleine Anfrage Schulbau Sanierung Kommunen Zuschüsse', 'schwach'),
];

describe('applyMMRSelection with vorgang_id', () => {
  it('prefers a hit of another procedure over a sibling of an already selected one', () => {
    const out = applyMMRSelection(results('1810968', '1810968'), 2);
    expect(out.map((r) => r.document_id)).toEqual(['gesetz', 'anderes']);
  });

  it('does not exclude siblings: they still fill free slots', () => {
    const out = applyMMRSelection(results('1810968', '1810968'), 3);
    // `aenderung` (0.89, Geschwister) schlägt `schwach` (0.5) trotz Abschlag
    expect(out.map((r) => r.document_id)).toEqual(['gesetz', 'anderes', 'aenderung']);
  });

  it('is unchanged without a procedure key', () => {
    const out = applyMMRSelection(results(), 2);
    expect(out.map((r) => r.document_id)).toEqual(['gesetz', 'aenderung']);
  });
});
