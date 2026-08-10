import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The turn's contract in one sentence: it either hands over a finished document
 * or it returns `null` and lets the old `@deepresearch` path answer.
 *
 * Almost every case below is therefore about what happens when something goes
 * wrong — and specifically about the quota, which must be charged if and only if
 * the user actually got a report.
 */

// Typed returns rather than bare `vi.fn()`: the forwarding mocks below hand
// their result straight back to the module under test, and an `any` there is an
// unsafe return the type-aware lint rules reject.
const runDeepAgentResearch = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const createDocumentWithContent = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>();
const checkLimit = vi.fn();
const incrementCount = vi.fn();
let linkupService: unknown = {};
const envMock = {
  DEEP_AGENT_RESEARCH_ENABLED: true,
  SCALEWAY_API_KEY: 'sk-test',
};

vi.mock('../../../config/env.js', () => ({ env: envMock }));
vi.mock('../../../services/research/deepAgent/index.js', () => ({
  runDeepAgentResearch: (...args: unknown[]) => runDeepAgentResearch(...args),
}));
vi.mock('../../../services/docs/DocGenerationService.js', () => ({
  createDocumentWithContent: (...args: unknown[]) => createDocumentWithContent(...args),
}));
vi.mock('../../../services/search/LinkupService.js', () => ({
  getLinkupService: () => linkupService,
}));
vi.mock('../../../services/counters/index.js', () => ({
  DeepResearchCounter: class {
    checkLimit = checkLimit;
    incrementCount = incrementCount;
    getTimeUntilReset = () => '5h 0m';
  },
}));
vi.mock('../../../utils/redis/index.js', () => ({ redisClient: { isReady: true } }));

const { runDeepAgentTurn, _resetDeepAgentCounterForTests } = await import('./deepAgentTurn.js');

function makeSse() {
  const sent: { event: string; payload: unknown }[] = [];
  return {
    sent,
    send: (event: string, payload: unknown) => sent.push({ event, payload }),
    sendRaw: () => {},
    // sendChatWarning checks this before writing; a double without it throws
    // where production would simply have emitted the warning.
    isEnded: () => false,
    events: () => sent.map((s) => s.event),
    payloadOf: (event: string) => sent.find((s) => s.event === event)?.payload,
  };
}

const STATE = {
  searchQuery: 'Wiens Klimaziel 2040',
  userLocale: 'de-AT',
  agentConfig: { userId: 'user-1' },
};

const GOOD_RESULT = {
  markdown: `# Bericht\n\n${'Text. '.repeat(100)}\n\n## Quellen\n\n1. A — https://a.example`,
  title: 'Bericht',
  summary: 'Wien will 2040 klimaneutral sein.',
  partial: false,
  sources: [{ url: 'https://a.example', title: 'A' }],
};

// The two casts are the boundary of the test double: `STATE` is the handful of
// fields this turn reads out of a ChatGraphState with dozens, and `makeSse` is a
// recording stand-in for the writer. Naming the full types here would assert
// nothing extra and would have to be rewritten on every unrelated state change.
const run = (sse: ReturnType<typeof makeSse>, state: object = STATE) =>
  runDeepAgentTurn({
    state: state as unknown as Parameters<typeof runDeepAgentTurn>[0]['state'],
    sse: sse as unknown as Parameters<typeof runDeepAgentTurn>[0]['sse'],
  });

/** Unwraps a `served` outcome, failing loudly on any other — the state a
 *  non-served case carries is `undefined`, which would silently pass a
 *  `toBeTruthy` further down. */
async function runServed(sse: ReturnType<typeof makeSse>, state: object = STATE) {
  const outcome = await run(sse, state);
  if (outcome.kind !== 'served') throw new Error(`erwartet: served, war: ${outcome.kind}`);
  return outcome.state;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetDeepAgentCounterForTests();
  envMock.DEEP_AGENT_RESEARCH_ENABLED = true;
  envMock.SCALEWAY_API_KEY = 'sk-test';
  linkupService = {};
  checkLimit.mockResolvedValue({ canResearch: true, count: 0, limit: 3, remaining: 3 });
  incrementCount.mockResolvedValue({ success: true });
  createDocumentWithContent.mockResolvedValue({ id: 'doc-42' });
  runDeepAgentResearch.mockResolvedValue(GOOD_RESULT);
});

describe('gates — each one falls through to the old path', () => {
  it('does nothing when the feature flag is off', async () => {
    envMock.DEEP_AGENT_RESEARCH_ENABLED = false;
    const sse = makeSse();

    expect(await run(sse)).toEqual({ kind: 'not_served' });
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
    expect(sse.sent).toHaveLength(0);
  });

  it('does nothing without a Scaleway key', async () => {
    envMock.SCALEWAY_API_KEY = '';
    expect(await run(makeSse())).toEqual({ kind: 'not_served' });
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
  });

  it('does nothing without Linkup, the floor under the search tools', async () => {
    linkupService = null;
    expect(await run(makeSse())).toEqual({ kind: 'not_served' });
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
  });

  it('does nothing without a question', async () => {
    expect(await run(makeSse(), { ...STATE, searchQuery: '   ' })).toEqual({ kind: 'not_served' });
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
  });

  it('does nothing without a userId, since the run could not be metered', async () => {
    expect(await run(makeSse(), { ...STATE, agentConfig: {} })).toEqual({ kind: 'not_served' });
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
  });

  /**
   * The one gate that does NOT hand over to the old path. Both engines meter
   * through a single Redis key, the agent's limit being the higher one — so a
   * spent agent allowance is necessarily over the dossier path's limit too. Its
   * warning would name a different number and contradict the one just sent.
   */
  it('reports a spent quota as such, so the sibling engine is not tried', async () => {
    checkLimit.mockResolvedValue({ canResearch: false, count: 3, limit: 3, remaining: 0 });
    const sse = makeSse();

    expect(await run(sse)).toEqual({ kind: 'quota_spent' });
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
    expect(sse.events()).toContain('warning');
  });

  it('names the agent limit in the warning, not the dossier path’s', async () => {
    checkLimit.mockResolvedValue({ canResearch: false, count: 3, limit: 3, remaining: 0 });
    const sse = makeSse();

    await run(sse);

    expect(JSON.stringify(sse.payloadOf('warning'))).toContain('3× pro Tag');
  });

  it('stays handed-over on a failed run — nothing was charged, so allowance remains', async () => {
    runDeepAgentResearch.mockResolvedValue(null);

    expect(await run(makeSse())).toEqual({ kind: 'not_served' });
  });
});

describe('success', () => {
  it('files the report, links it, and returns only a summary', async () => {
    const sse = makeSse();

    const patch = await runServed(sse);

    expect(createDocumentWithContent).toHaveBeenCalledOnce();
    const [title, markdown, subtype, userId] = createDocumentWithContent.mock.calls[0];
    expect(title).toBe('Bericht');
    expect(markdown).toContain('## Quellen');
    expect(subtype).toBe('docs');
    expect(userId).toBe('user-1');

    expect(patch.deepResearchAnswer).toBe('Wien will 2040 klimaneutral sein.');
    expect(sse.payloadOf('document_created')).toMatchObject({
      documentId: 'doc-42',
      url: '/office/doc-42',
    });
  });

  it('announces the wait in the chat itself before any work starts', async () => {
    const sse = makeSse();

    await run(sse);

    // The first thing the user sees must be prose, not a progress event: this
    // turn is silent for minutes otherwise.
    expect(sse.sent[0]?.event).toBe('text_delta');
    expect(String((sse.sent[0]?.payload as { text: string }).text)).toContain('einige Minuten');
    expect(sse.events()).toContain('research_log_start');
  });

  it('closes the sidebar log with the document link', async () => {
    const sse = makeSse();

    await run(sse);

    const updates = sse.sent.filter((s) => s.event === 'research_log_update');
    expect(updates.at(-1)?.payload).toMatchObject({
      status: 'done',
      documentUrl: '/office/doc-42',
    });
  });

  it('charges the quota only after the document exists', async () => {
    const order: string[] = [];
    createDocumentWithContent.mockImplementation(async () => {
      order.push('document');
      return { id: 'doc-42' };
    });
    incrementCount.mockImplementation(async () => {
      order.push('quota');
      return { success: true };
    });

    await run(makeSse());

    expect(order).toEqual(['document', 'quota']);
  });

  it('marks a partial report in the chat message', async () => {
    runDeepAgentResearch.mockResolvedValue({ ...GOOD_RESULT, partial: true });

    const patch = await runServed(makeSse());

    expect(patch.deepResearchAnswer).toContain('Zwischenstand');
  });

  it('passes the Austrian locale through to the agent', async () => {
    await run(makeSse());
    expect(runDeepAgentResearch.mock.calls[0][0]).toMatchObject({ locale: 'de-AT' });
  });
});

describe('failure', () => {
  it('leaves the quota untouched when the run yields no report', async () => {
    runDeepAgentResearch.mockResolvedValue(null);
    const sse = makeSse();

    expect(await run(sse)).toEqual({ kind: 'not_served' });
    expect(incrementCount).not.toHaveBeenCalled();
    expect(createDocumentWithContent).not.toHaveBeenCalled();
    expect(sse.events()).toContain('warning');
  });

  it('leaves the quota untouched when the agent throws', async () => {
    runDeepAgentResearch.mockRejectedValue(new Error('boom'));

    expect(await run(makeSse())).toEqual({ kind: 'not_served' });
    expect(incrementCount).not.toHaveBeenCalled();
  });

  it('leaves the quota untouched when the document cannot be created', async () => {
    createDocumentWithContent.mockRejectedValue(new Error('db down'));
    const sse = makeSse();

    expect(await run(sse)).toEqual({ kind: 'not_served' });
    expect(incrementCount).not.toHaveBeenCalled();
    expect(sse.events()).toContain('warning');
  });

  it('still delivers the report when only the quota increment fails', async () => {
    incrementCount.mockRejectedValue(new Error('redis weg'));

    const patch = await runServed(makeSse());

    expect(patch.deepResearchAnswer).toBeTruthy();
  });
});
