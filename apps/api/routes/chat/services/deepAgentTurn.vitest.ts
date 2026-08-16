import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The turn's contract in one sentence: it either hands over a finished document
 * or it returns `null` and lets the old `@deepresearch` path answer.
 *
 * Almost every case below is therefore about what happens when something goes
 * wrong — and specifically about the quota, which must be charged if and only if
 * the user actually got a report. Whether an allowance EXISTS is not this
 * module's question any more; the caller settles that for both engines, and
 * `deepResearchQuota.vitest.ts` covers it.
 */

// Typed returns rather than bare `vi.fn()`: the forwarding mocks below hand
// their result straight back to the module under test, and an `any` there is an
// unsafe return the type-aware lint rules reject.
const runDeepAgentResearch = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const createDocumentWithContent = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>();
const chargeDeepResearch = vi.fn<(userId: string) => Promise<void>>();
let linkupService: unknown = {};
const envMock = {
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
vi.mock('./deepResearchQuota.js', () => ({
  chargeDeepResearch: (userId: string) => chargeDeepResearch(userId),
}));

const { runDeepAgentTurn } = await import('./deepAgentTurn.js');

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

/** Unwraps a served patch, failing loudly on `null` — which would otherwise
 *  slip past a `toBeTruthy` on one of its fields further down. */
async function runServed(sse: ReturnType<typeof makeSse>, state: object = STATE) {
  const patch = await run(sse, state);
  if (!patch) throw new Error('erwartet: ein Zustands-Patch, war: null');
  return patch;
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.SCALEWAY_API_KEY = 'sk-test';
  linkupService = {};
  chargeDeepResearch.mockResolvedValue();
  createDocumentWithContent.mockResolvedValue({ id: 'doc-42' });
  runDeepAgentResearch.mockResolvedValue(GOOD_RESULT);
});

describe('gates — each one falls through to the old path', () => {
  it('does nothing without a Scaleway key, and stays silent doing it', async () => {
    envMock.SCALEWAY_API_KEY = '';
    const sse = makeSse();

    expect(await run(sse)).toBeNull();
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
    // The old path is about to answer — a gate must not narrate its own absence.
    expect(sse.sent).toHaveLength(0);
  });

  it('does nothing without Linkup, the floor under the search tools', async () => {
    linkupService = null;
    expect(await run(makeSse())).toBeNull();
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
  });

  it('does nothing without a question', async () => {
    expect(await run(makeSse(), { ...STATE, searchQuery: '   ' })).toBeNull();
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
  });

  it('does nothing without a userId, since the run could not be metered', async () => {
    expect(await run(makeSse(), { ...STATE, agentConfig: {} })).toBeNull();
    expect(runDeepAgentResearch).not.toHaveBeenCalled();
  });

  it('stays handed-over on a failed run — nothing was charged, so allowance remains', async () => {
    runDeepAgentResearch.mockResolvedValue(null);

    expect(await run(makeSse())).toBeNull();
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
    expect(String((sse.sent[0]?.payload as { text: string }).text)).toContain(
      'zehn bis fünfzehn Minuten'
    );
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
    chargeDeepResearch.mockImplementation(async () => {
      order.push('quota');
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

  /**
   * The notebook scope is the whole access story: what the turn does not put in
   * is what the agent cannot reach. Personal notebooks arrive as document ids
   * the controller already checked ownership for — nothing is resolved here.
   */
  it('hands the agent the notebooks this turn already had in hand', async () => {
    await run(makeSse(), {
      ...STATE,
      notebookCollectionIds: ['hamburg'],
      notebookDocumentIds: ['d1'],
    });

    const params = runDeepAgentResearch.mock.calls[0][0] as {
      notebookScope?: {
        mentionedCollections: string[];
        documentIds: string[];
        userId: string;
        corpora: { id: string }[];
      };
    };
    expect(params.notebookScope).toMatchObject({
      mentionedCollections: ['hamburg'],
      documentIds: ['d1'],
      userId: 'user-1',
    });
    // Der Turn ist de-AT, also gehört kein deutsches Landesverbands-Korpus dazu.
    const ids = params.notebookScope?.corpora.map((c) => c.id) ?? [];
    expect(ids).toContain('oesterreich-notebook');
    expect(ids).not.toContain('berlin-notebook');
  });
});

describe('failure', () => {
  it('leaves the quota untouched when the run yields no report', async () => {
    runDeepAgentResearch.mockResolvedValue(null);
    const sse = makeSse();

    expect(await run(sse)).toBeNull();
    expect(chargeDeepResearch).not.toHaveBeenCalled();
    expect(createDocumentWithContent).not.toHaveBeenCalled();
    expect(sse.events()).toContain('warning');
  });

  it('leaves the quota untouched when the agent throws', async () => {
    runDeepAgentResearch.mockRejectedValue(new Error('boom'));

    expect(await run(makeSse())).toBeNull();
    expect(chargeDeepResearch).not.toHaveBeenCalled();
  });

  it('leaves the quota untouched when the document cannot be created', async () => {
    createDocumentWithContent.mockRejectedValue(new Error('db down'));
    const sse = makeSse();

    expect(await run(sse)).toBeNull();
    expect(chargeDeepResearch).not.toHaveBeenCalled();
    expect(sse.events()).toContain('warning');
  });
});
