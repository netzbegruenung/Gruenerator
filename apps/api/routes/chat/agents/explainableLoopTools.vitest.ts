import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const mocks = vi.hoisted(() => ({
  getOwnExplainable: vi.fn<(...a: unknown[]) => unknown>(),
  reviseExplainable: vi.fn<(...a: unknown[]) => unknown>(),
}));
vi.mock('../../../services/explainables/explainableRepository.js', () => ({
  getOwnExplainable: (...a: unknown[]) => mocks.getOwnExplainable(...a),
}));
vi.mock('../../../services/explainables/reviseExplainable.js', () => ({
  reviseExplainable: (...a: unknown[]) => mocks.reviseExplainable(...a),
  describeExplainable: () => '# Klimageld',
}));

const { makeEditExplainableTool, makeReadExplainableTool } =
  await import('./explainableLoopTools.js');

const stateWith = (lastUser: string, over: Record<string, unknown> = {}) =>
  ({
    agentConfig: { userId: 'u1' },
    threadArtifacts: [{ kind: 'explainable', ref: 'e1' }],
    messages: [{ role: 'user', content: lastUser }],
    ...over,
  }) as unknown as ChatGraphState;
const run = (t: unknown, input: unknown) =>
  (t as { execute: (i: unknown, o?: unknown) => Promise<Record<string, unknown>> }).execute(
    input,
    {}
  );
const edit = (state: ChatGraphState) => makeEditExplainableTool({ state, threadId: 't1' });

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe('read_explainable', () => {
  it('returns the page as text', async () => {
    mocks.getOwnExplainable.mockResolvedValue({ content: {} });
    const out = await run(makeReadExplainableTool({ state: stateWith('?'), threadId: 't1' }), {});
    expect(out).toEqual({ explainableId: 'e1', inhalt: '# Klimageld' });
  });

  it('errors without an explainable in the thread', async () => {
    const state = stateWith('?', { threadArtifacts: [] });
    expect((await run(makeReadExplainableTool({ state, threadId: 't1' }), {})).error).toBeDefined();
  });
});

describe('edit_explainable', () => {
  it('reports a revision', async () => {
    mocks.reviseExplainable.mockResolvedValue({
      status: 'revised',
      title: 'K',
      summary: '',
      keptImages: 1,
    });
    const out = await run(edit(stateWith('Mach Abschnitt 2 einfacher')), {
      anweisung: 'x',
      confirm: false,
    });
    expect(out.ok).toBe(true);
    expect(mocks.reviseExplainable).toHaveBeenCalledWith(
      expect.objectContaining({ explainableId: 'e1', removalAllowed: false, locale: 'de-DE' })
    );
  });

  it('edits the explainable that holds the quoted section, whatever id the model passed', async () => {
    mocks.getOwnExplainable.mockImplementation(async (_u, id) => ({
      content: id === 'e-co2' ? { sections: [{ heading: 'Was passiert mit dem Geld?' }] } : {},
    }));
    mocks.reviseExplainable.mockResolvedValue({
      status: 'revised',
      title: 'CO2',
      summary: '',
      keptImages: 0,
    });
    const state = stateWith('x', {
      threadArtifacts: [
        { kind: 'explainable', ref: 'e-co2' },
        { kind: 'explainable', ref: 'e-klima' },
      ],
    });
    const out = await run(edit(state), {
      anweisung: 'Mach den Abschnitt „Was passiert mit dem Geld?" einfacher',
      explainableId: 'e-klima',
      confirm: false,
    });
    expect(out.explainableId).toBe('e-co2');
    expect(mocks.reviseExplainable).toHaveBeenCalledWith(
      expect.objectContaining({ explainableId: 'e-co2' })
    );
  });

  it('asks before dropping sections, and refuses an unagreed confirm', async () => {
    mocks.reviseExplainable.mockResolvedValue({
      status: 'needs_confirmation',
      title: 'K',
      removedHeadings: ['Fazit'],
    });
    const ask = await run(edit(stateWith('Kürz das')), { anweisung: 'x', confirm: false });
    expect(ask.needsConfirmation).toBe(true);
    const refused = await run(edit(stateWith('Kürz das')), { anweisung: 'x', confirm: true });
    expect(refused.error).toMatch(/nicht zugestimmt/);
  });
});
