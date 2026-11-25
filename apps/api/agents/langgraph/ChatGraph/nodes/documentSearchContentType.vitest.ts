/**
 * Die Dokumentart eines Turns auf dem Einzeldurchlauf (`CHAT_AGENT_LOOP=false`).
 *
 * `detectedFilters.content_type` spricht das Vokabular der Landesverbands-
 * Sammlung (`beschluss`, `presse`, …). Der Einzeldurchlauf gab den ganzen
 * Filter an jede Sammlung weiter; auf `deutschland` oder `kommunalwiki` gibt es
 * diese Werte nicht, und die Suche dort kam leer zurück. Seit #6050 setzt der
 * Verfeinerer die Art in mehr Turns, der Schaden wuchs mit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeDocumentSearchParallel } from './searchNode.js';

import type { AgentConfig } from '../../../../routes/chat/agents/types.js';

const direct = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<unknown>>());
vi.mock('../../../../routes/chat/agents/directSearch.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  executeDirectSearch: (...a: unknown[]) => direct(...a),
}));

const universal = { userId: 'u1' } as AgentConfig;
const lvAgent = {
  userId: 'u1',
  defaultFilter: { content_type: ['presse'] },
} as unknown as AgentConfig;

const calls = () => direct.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('executeDocumentSearchParallel — Dokumentart nur für die LV-Sammlung', () => {
  beforeEach(() => {
    direct.mockReset();
    direct.mockResolvedValue({ collection: 'x', results: [] });
  });

  it('gibt content_type als lvContentType weiter, nicht als Filter jeder Sammlung', async () => {
    await executeDocumentSearchParallel('Hitze', null, ['hessen', 'deutschland'], universal, {
      content_type: 'beschluss',
    });
    expect(calls()).toHaveLength(2);
    for (const params of calls()) {
      expect(params).not.toHaveProperty('filters');
      expect(params).toMatchObject({ lvContentType: ['beschluss'] });
    }
  });

  it('die übrigen Filter bleiben Filter', async () => {
    await executeDocumentSearchParallel('Hitze', null, ['hessen'], universal, {
      content_type: 'beschluss',
      date_from: '2026-01-01',
    });
    expect(calls()[0]).toMatchObject({
      filters: { date_from: '2026-01-01' },
      lvContentType: ['beschluss'],
    });
    expect(calls()[0]?.filters).not.toHaveProperty('content_type');
  });

  it('die feste Vorgabe des Agents geht vor', async () => {
    await executeDocumentSearchParallel('Hitze', null, ['hessen'], lvAgent, {
      content_type: 'beschluss',
    });
    expect(calls()[0]).toMatchObject({ lvContentType: ['presse'] });
  });

  it('ohne Filter und ohne Vorgabe: weder Filter noch Art', async () => {
    await executeDocumentSearchParallel('Hitze', null, ['hessen'], universal, null);
    expect(calls()[0]).not.toHaveProperty('filters');
    expect(calls()[0]).not.toHaveProperty('lvContentType');
  });
});
