/**
 * Ein fehlender interner systemRole ist ein Rollout-Loch und muss laut ins Log —
 * außer beim Suche-Agenten (`routeTo: 'search'`): der SearchGraph liest dessen
 * Persona nie, der Fehler war dort ein Fehlalarm, der echte Lücken überdeckte (#3713).
 *
 * Run with: cd apps/api && npx vitest run routes/chat/agents/agentLoaderMissingRole.vitest.ts
 */
import { describe, expect, it, vi } from 'vitest';

// Recorded outside the mock: the loader logs once, during the first load, and
// vitest 5 clears mock.calls before every test (`clearMocks` defaults to true).
const logged: unknown[][] = [];
const error = vi.fn((...args: unknown[]) => void logged.push(args));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error, debug: vi.fn() }),
}));
vi.mock('../../../services/skills/internalPrompts.js', () => ({
  getInternalAgentPrompt: () => null,
}));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn(), queryOne: vi.fn() }),
}));

const { getAgent } = await import('./agentLoader.js');

const loggedIds = () => logged.map((c) => String(c[0]).match(/"([^"]+)"/)?.[1]);

describe('agentLoader — fehlender interner systemRole', () => {
  it('meldet den Suche-Agenten nicht, gibt ihm aber trotzdem eine Rolle', async () => {
    expect(loggedIds()).not.toContain('gruenerator-suche');
    expect((await getAgent('gruenerator-suche'))?.systemRole).toBeTruthy();
  });

  it('meldet gewöhnliche Agenten ohne Persona weiterhin', () => {
    expect(loggedIds()).toContain('gruenerator-oeffentlichkeitsarbeit-saarland');
  });
});
