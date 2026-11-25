/**
 * Die Dokumentart eines Turns im Notebook-Zweig von `executeMultiDocFanout`.
 *
 * Live 25.11.2026: „was haben wir beschlossen zu hitze?", dann „@Grüne Hessen
 * suche nur im notebook". Der Vorab-Abruf suchte im Hessen-Notebook über alles,
 * weil der Fan-out keinen Weg hatte, einen Inhaltstyp weiterzugeben — nur die
 * feste Vorgabe eines LV-Agents kam an.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeMultiDocFanout } from './searchNode.js';

import type { AgentConfig } from '../../../../routes/chat/agents/types.js';
import type { DocumentSource } from '../types.js';

const direct = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../routes/chat/agents/directSearch.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  executeDirectSearch: (...a: unknown[]) => direct(...a),
}));
vi.mock(
  '../../../../services/document-services/DocumentSearchService/index.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getQdrantDocumentService: () => ({ search: vi.fn() }),
  })
);

const hessen = {
  kind: 'notebook',
  id: 'hessen-notebook',
  label: 'Grüne Hessen',
  collectionIds: ['hessen'],
} as DocumentSource;

const hit = { source: 'Beschluss', url: 'https://x/1', excerpt: 'Hitzeschutz', relevance: 'hoch' };
const answer = (results: unknown[]) => ({ collection: 'hessen', results });

const universal = { userId: 'u1' } as AgentConfig;
const lvAgent = {
  userId: 'u1',
  defaultFilter: { content_type: ['presse'] },
} as unknown as AgentConfig;

const paramsAt = (i: number) => direct.mock.calls[i]?.[0] as Record<string, unknown>;

describe('executeMultiDocFanout — Dokumentart im Notebook-Zweig', () => {
  beforeEach(() => direct.mockReset());

  it('reicht die Art des Turns als lvContentType weiter', async () => {
    direct.mockResolvedValue(answer([hit]));
    await executeMultiDocFanout('Hitze', [hessen], universal, { contentType: ['beschluss'] });
    expect(direct).toHaveBeenCalledTimes(1);
    expect(paramsAt(0)).toMatchObject({ collection: 'hessen', lvContentType: ['beschluss'] });
  });

  it('ohne Art sucht er wie bisher ungefiltert', async () => {
    direct.mockResolvedValue(answer([hit]));
    await executeMultiDocFanout('Hitze', [hessen], universal);
    expect(paramsAt(0)).not.toHaveProperty('lvContentType');
  });

  it('die feste Vorgabe des Agents geht vor', async () => {
    direct.mockResolvedValue(answer([hit]));
    await executeMultiDocFanout('Hitze', [hessen], lvAgent, { contentType: ['beschluss'] });
    expect(paramsAt(0)).toMatchObject({ lvContentType: ['presse'] });
  });

  it('leer mit geratener Art: einmal ohne sie', async () => {
    direct.mockResolvedValueOnce(answer([])).mockResolvedValueOnce(answer([hit]));
    const out = await executeMultiDocFanout('Hitze', [hessen], universal, {
      contentType: ['beschluss'],
    });
    expect(direct).toHaveBeenCalledTimes(2);
    expect(paramsAt(1)).not.toHaveProperty('lvContentType');
    expect(out.perSourceResults['hessen-notebook']).toHaveLength(1);
  });

  it('leer mit der Vorgabe des Agents: kein zweiter Versuch', async () => {
    direct.mockResolvedValue(answer([]));
    await executeMultiDocFanout('Hitze', [hessen], lvAgent, { contentType: ['beschluss'] });
    expect(direct).toHaveBeenCalledTimes(1);
  });
});
