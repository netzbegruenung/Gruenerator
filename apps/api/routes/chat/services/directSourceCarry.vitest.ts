import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A `direct` turn carries no sources — that is what `direct` means. But "Mehr
 * dazu bitte" after a sourced research answer also classifies `direct`, and
 * there the model had nothing to work from but its own previous prose. The
 * answer came out ungrounded, uncitable, and to the reader indistinguishable
 * from research.
 *
 * The fix hands such a turn the research the thread already paid for. The
 * interesting half of these tests is the NEGATIVE space: the carry must not
 * fire on ordinary direct turns, and — because it costs a DB round-trip — the
 * helper must not even be CALLED for them.
 */

const getRecentThreadSources = vi.fn();

vi.mock('./threadPersistenceService.js', () => ({
  getRecentThreadSources: (...a: unknown[]) => getRecentThreadSources(...a),
  createMessage: vi.fn(),
  getKeptResearchForRetry: vi.fn(),
  touchThread: vi.fn(),
}));

const { carryThreadSourcesIfNeeded } = await import('./intentExecutionService.js');

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const SOURCES = [
  { source: 'tagesschau.de', url: 'https://tagesschau.de/a', content: 'Ein belegter Satz.' },
  { source: 'gruene.de', url: 'https://gruene.de/b', content: 'Noch einer.' },
];

function state(userText: string, overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    intent: 'direct',
    messages: [
      { role: 'user', content: 'Was plant die Bundesregierung beim Deutschlandticket?' },
      { role: 'assistant', content: 'Eine belegte Antwort [1].' },
      { role: 'user', content: userText },
    ],
    searchResults: [],
    citations: [],
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('carryThreadSourcesIfNeeded', () => {
  beforeEach(() => {
    getRecentThreadSources.mockReset();
    getRecentThreadSources.mockResolvedValue(SOURCES);
  });

  it('grounds a vague continuation on the thread research', async () => {
    const out = await carryThreadSourcesIfNeeded(state('Mehr dazu bitte'), 't1');
    expect(out.searchResults).toHaveLength(2);
    expect(out.citations).toHaveLength(2);
    expect(out.sourcesCarriedFromThread).toBe(true);
  });

  it('does not even ASK the database for a pleasantry', async () => {
    // The gate is what keeps this from becoming a query on every direct turn.
    const out = await carryThreadSourcesIfNeeded(state('Danke!'), 't1');
    expect(getRecentThreadSources).not.toHaveBeenCalled();
    expect(out.sourcesCarriedFromThread).toBeUndefined();
  });

  it('never fires for a greeting turn, however it is phrased', async () => {
    // The INTENT gate, not the text gate: "Mehr dazu bitte" passes
    // needsThreadGrounding, so only `intent !== 'direct'` keeps the DB
    // round-trip out of the cheapest turn in the product.
    const out = await carryThreadSourcesIfNeeded(
      state('Mehr dazu bitte', { intent: 'greeting' } as Partial<ChatGraphState>),
      't1'
    );
    expect(getRecentThreadSources).not.toHaveBeenCalled();
    expect(out.sourcesCarriedFromThread).toBeUndefined();
  });

  it('does not fire on a rewrite instruction', async () => {
    await carryThreadSourcesIfNeeded(state('Mach das kürzer'), 't1');
    expect(getRecentThreadSources).not.toHaveBeenCalled();
  });

  it('is a no-op on a thread with no prior research', async () => {
    // Self-limiting by construction: no sources, nothing to carry, no flag.
    getRecentThreadSources.mockResolvedValue([]);
    const out = await carryThreadSourcesIfNeeded(state('Mehr dazu bitte'), 't1');
    expect(out.searchResults).toHaveLength(0);
    expect(out.sourcesCarriedFromThread).toBeUndefined();
  });

  it('skips a thread-less turn', async () => {
    await carryThreadSourcesIfNeeded(state('Mehr dazu bitte'), null);
    expect(getRecentThreadSources).not.toHaveBeenCalled();
  });

  it('never overwrites sources a real search produced', async () => {
    const out = await carryThreadSourcesIfNeeded(
      state('Mehr dazu bitte', {
        searchResults: [{ source: 'live', url: 'https://x', content: 'frisch' }],
      } as Partial<ChatGraphState>),
      't1'
    );
    expect(getRecentThreadSources).not.toHaveBeenCalled();
    expect(out.searchResults).toHaveLength(1);
  });

  it('leaves retrieval intents alone', async () => {
    await carryThreadSourcesIfNeeded(state('Mehr dazu bitte', { intent: 'search' }), 't1');
    expect(getRecentThreadSources).not.toHaveBeenCalled();
  });

  it('survives a database failure without failing the turn', async () => {
    getRecentThreadSources.mockRejectedValue(new Error('connection reset'));
    const out = await carryThreadSourcesIfNeeded(state('Mehr dazu bitte'), 't1');
    expect(out.searchResults).toHaveLength(0);
    expect(out.sourcesCarriedFromThread).toBeUndefined();
  });

  it('asks for a continuation-sized window, not a fresh dossier', async () => {
    await carryThreadSourcesIfNeeded(state('Mehr dazu bitte'), 't1');
    expect(getRecentThreadSources).toHaveBeenCalledWith('t1', 6);
  });
});
