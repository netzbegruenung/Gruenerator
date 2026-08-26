/**
 * Der Prozess-Puffer vor der Tabelle.
 *
 * Er sitzt im heißesten Pfad, den es gibt — das Agenten-Inventar geht bei jedem
 * Chat-Turn in den Systemprompt. Zwei Eigenschaften tragen ihn: er fragt die
 * Datenbank nicht pro Turn, und wenn sie nicht antwortet, zeigt er lieber zu
 * viel als zu wenig.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const select = vi.fn();

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({ select }),
}));

vi.mock('../../database/schema/index.js', () => ({
  adminHiddenAgents: { agent_identifier: 'agent_identifier' },
}));

const warn = vi.fn();
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/** `db.select({...}).from(table)` — nur die zwei Glieder, die der Dienst nutzt. */
function rows(value: { agent_identifier: string }[] | Error) {
  select.mockReturnValue({
    from: () => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)),
  });
}

async function loadService() {
  vi.resetModules();
  return import('./AdminHiddenAgentsService.js');
}

beforeEach(() => {
  select.mockReset();
  warn.mockReset();
});

describe('getHiddenAgentIdentifiersCached', () => {
  it('fragt die Tabelle einmal und antwortet danach aus dem Puffer', async () => {
    rows([{ agent_identifier: 'gruenerator-antrag' }]);
    const svc = await loadService();

    expect(await svc.getHiddenAgentIdentifiersCached(0)).toEqual(['gruenerator-antrag']);
    expect(await svc.getHiddenAgentIdentifiersCached(30_000)).toEqual(['gruenerator-antrag']);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('fragt nach Ablauf der Frist erneut', async () => {
    rows([{ agent_identifier: 'gruenerator-antrag' }]);
    const svc = await loadService();

    await svc.getHiddenAgentIdentifiersCached(0);
    rows([]);
    expect(await svc.getHiddenAgentIdentifiersCached(60_001)).toEqual([]);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('vergisst den Puffer nach einem Schaltvorgang', async () => {
    rows([]);
    const svc = await loadService();

    await svc.getHiddenAgentIdentifiersCached(0);
    svc.clearHiddenAgentsCache();
    rows([{ agent_identifier: 'gruenerator-antrag' }]);

    expect(await svc.getHiddenAgentIdentifiersCached(1)).toEqual(['gruenerator-antrag']);
  });

  // Andersherum verlöre der Systemprompt sein halbes Inventar, und zwar
  // unbemerkt: eine leere Antwort sieht aus wie „nichts ausgeblendet".
  it('zeigt bei einem Datenbankfehler alles und puffert den Fehler nicht', async () => {
    rows(new Error('pool not initialized'));
    const svc = await loadService();

    expect(await svc.getHiddenAgentIdentifiersCached(0)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);

    rows([{ agent_identifier: 'gruenerator-antrag' }]);
    expect(await svc.getHiddenAgentIdentifiersCached(1)).toEqual(['gruenerator-antrag']);
  });
});
