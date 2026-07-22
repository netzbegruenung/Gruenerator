import { describe, it, expect } from 'vitest';

import { buildMcpOutcomeNote } from './agenticRespondService.js';

import type { PersistedStep } from './types.js';

function step(over: Partial<PersistedStep>): PersistedStep {
  return { toolCallId: 't', toolName: 'tool', args: {}, result: {}, ...over };
}

describe('buildMcpOutcomeNote', () => {
  it('is empty when no MCP (serverName) steps ran', () => {
    expect(buildMcpOutcomeNote([step({ toolName: 'gruenerator_search' })])).toBe('');
    expect(buildMcpOutcomeNote([])).toBe('');
  });

  it('reports a successful connector call', () => {
    const note = buildMcpOutcomeNote([
      step({ serverName: 'Tally', toolName: 'm123__create_form', result: { content: 'ok' } }),
    ]);
    expect(note).toMatch(/Tally · m123__create_form: erfolgreich/);
    expect(note).not.toMatch(/FEHLGESCHLAGEN/);
  });

  it('reports a failed connector call and forbids claiming success', () => {
    const note = buildMcpOutcomeNote([
      step({
        serverName: 'Tally',
        toolName: 'm123__create_form',
        result: { error: 'no workspace' },
      }),
    ]);
    expect(note).toMatch(/FEHLGESCHLAGEN — no workspace/);
    expect(note).toMatch(/NIEMALS einen Erfolg/);
  });
});
