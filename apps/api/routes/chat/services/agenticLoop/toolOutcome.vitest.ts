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

  it('embeds the result content so the synth can relay it (not just "erfolgreich")', () => {
    const note = buildMcpOutcomeNote([
      step({
        serverName: 'Sally',
        toolName: 'mb2__get_summary',
        result: { content: 'Protokoll vom 12.3.: Beschluss zu Tempo 30 gefasst.' },
      }),
    ]);
    expect(note).toMatch(/Beschluss zu Tempo 30/);
    expect(note).toMatch(/KONKRET WIEDER/);
    expect(note).not.toMatch(/FEHLGESCHLAGEN/);
  });

  it('truncates oversized content', () => {
    const big = 'x'.repeat(5000);
    const note = buildMcpOutcomeNote([
      step({ serverName: 'Sally', toolName: 'mb2__get_recordings', result: { content: big } }),
    ]);
    expect(note).toContain('…');
    expect(note.length).toBeLessThan(2200);
  });

  it('notes success-without-content explicitly', () => {
    const note = buildMcpOutcomeNote([
      step({ serverName: 'Tally', toolName: 'm123__save_form', result: { content: '' } }),
    ]);
    expect(note).toMatch(/kein Inhalt zur(ü|ue)ckgegeben/);
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
