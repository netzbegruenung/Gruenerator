/**
 * Deckt die Budget-Schranke ab, die mit #2998 an die Stelle der fünf
 * handgeschriebenen Kandidaten-Fenster getreten ist.
 *
 * Der Punkt der Prüfungen ist nicht, dass gekürzt WIRD — sondern dass im
 * Normalbetrieb NICHTS gekürzt wird. Eine Schranke, die bei alltäglicher Last
 * zuschlägt, wäre wieder das Fenster, das gerade entfernt wurde.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RerankCall {
  documents: string[];
}
type RerankScore = { originalIndex: number; relevanceScore: number };

const rerank = vi.fn<(req: RerankCall) => Promise<RerankScore[]>>();
vi.mock('./RegoloRerankService.js', () => ({
  regoloRerankService: { rerank: (req: RerankCall) => rerank(req) },
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { rerankPipeline } = await import('./rerankPipeline.js');

/** Kandidat mit vorhersagbarer Länge und genug Wortmaterial für die Auswahl. */
function item(title: string, chars: number, marker = 'Klimageld') {
  const sentence = `${marker} kostet Geld und steht im Beschluss. `;
  const body = sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
  return { title, content: body };
}

function docsFromLastCall(): string[] {
  return rerank.mock.calls.at(-1)?.[0]?.documents ?? [];
}

beforeEach(() => {
  rerank.mockReset();
  rerank.mockImplementation(({ documents }) =>
    Promise.resolve(documents.map((_, i) => ({ originalIndex: i, relevanceScore: 0.9 - i * 0.01 })))
  );
});

describe('rerankPipeline — Budget', () => {
  it('lässt typische Last unangetastet (16 × ~6400 Zeichen ≈ heutige Messung)', async () => {
    const items = Array.from({ length: 16 }, (_, i) => item(`Dok ${i}`, 6400));

    await rerankPipeline({ query: 'Klimageld', items, inputLimit: 16, minRelevance: 0 });

    const docs = docsFromLastCall();
    expect(docs).toHaveLength(16);
    // Nichts gekürzt: jedes Dokument trägt seinen Inhalt vollständig.
    for (const [i, doc] of docs.entries()) {
      expect(doc.length).toBeGreaterThanOrEqual(6400);
      expect(doc).toContain(`Dok ${i}`);
    }
  });

  it('kürzt einen einzelnen Kandidaten über der Paar-Grenze', async () => {
    const items = [item('Klein A', 1000), item('Riese', 40_000), item('Klein B', 1000)];

    await rerankPipeline({ query: 'Klimageld', items, inputLimit: 3, minRelevance: 0 });

    const docs = docsFromLastCall();
    expect(docs[1]!.length).toBeLessThanOrEqual(16_000);
    // Die kleinen bleiben unberührt — ein gleichmässiger Deckel hätte sie mitgenommen.
    expect(docs[0]!.length).toBeGreaterThanOrEqual(1000);
    expect(docs[2]!.length).toBeGreaterThanOrEqual(1000);
  });

  it('hält die Summe unter der Aufruf-Grenze, wenn viele grosse Kandidaten kommen', async () => {
    const items = Array.from({ length: 16 }, (_, i) => item(`Gross ${i}`, 15_000));

    await rerankPipeline({ query: 'Klimageld', items, inputLimit: 16, minRelevance: 0 });

    const total = docsFromLastCall().reduce((sum, d) => sum + d.length, 0);
    // 16 × 15 000 = 240 000 roh; die Decke liegt bei 150 000.
    expect(total).toBeLessThanOrEqual(150_000);
  });

  it('leert beim Kürzen keinen Kandidaten', async () => {
    const items = Array.from({ length: 16 }, (_, i) => item(`Gross ${i}`, 30_000));

    await rerankPipeline({ query: 'Klimageld', items, inputLimit: 16, minRelevance: 0 });

    for (const doc of docsFromLastCall()) {
      expect(doc.trim().length).toBeGreaterThan(0);
    }
  });

  it('behält die Reihenfolge, damit rankedIndices weiter auf die Eingabe zeigen', async () => {
    const items = [item('Klein', 800), item('Riese', 40_000), item('Mittel', 5000)];
    rerank.mockImplementation(() =>
      Promise.resolve([
        { originalIndex: 2, relevanceScore: 0.9 },
        { originalIndex: 0, relevanceScore: 0.8 },
        { originalIndex: 1, relevanceScore: 0.7 },
      ])
    );

    const result = await rerankPipeline({
      query: 'Klimageld',
      items,
      inputLimit: 3,
      minRelevance: 0,
      applyDiversity: false,
    });

    const docs = docsFromLastCall();
    expect(docs[0]).toContain('Klein');
    expect(docs[1]).toContain('Riese');
    expect(docs[2]).toContain('Mittel');
    expect(result.rankedIndices[0]).toBe(2);
  });

  it('rechnet die Herkunftsmarke mit — sie steht mit im Dokument', async () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`Dok ${i}`, 30_000));

    await rerankPipeline({
      query: 'Klimageld',
      items,
      inputLimit: 8,
      minRelevance: 0,
      maxCharsPerItem: 2000,
      // Die längste Marke, die `getSourceTag` vergibt.
      sourceTagFn: () => 'Parlamentsdokument',
    });

    // Ohne Mitzählen der Marke läge jedes Dokument um `[Parlamentsdokument] `
    // (21 Zeichen) über der Decke.
    for (const doc of docsFromLastCall()) {
      expect(doc.startsWith('[Parlamentsdokument] ')).toBe(true);
      expect(doc.length).toBeLessThanOrEqual(2000);
    }
  });

  it('respektiert ausdrücklich übergebene Grenzen', async () => {
    const items = Array.from({ length: 4 }, (_, i) => item(`Dok ${i}`, 4000));

    await rerankPipeline({
      query: 'Klimageld',
      items,
      inputLimit: 4,
      minRelevance: 0,
      maxCharsPerItem: 1000,
      maxCharsPerCall: 4000,
    });

    for (const doc of docsFromLastCall()) {
      expect(doc.length).toBeLessThanOrEqual(1000);
    }
  });
});
