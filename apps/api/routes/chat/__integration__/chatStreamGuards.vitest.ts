/**
 * The precedence gates — the highest-bug-history region of the router.
 *
 * Both gates below exist BECAUSE their upstream doors leaked. The router says
 * so itself: the sharepic licence "is what let the classifier lose five
 * regexes", and the negative-action gate exists because of the artifact
 * intents' many doors, "and only the Tier-3 ones ever checked for negation".
 * The predicates are unit-tested in fastPathGuards.vitest.ts; what is untested
 * is that the ROUTER still consults them, on the text it is supposed to, before
 * anything can produce an artifact.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/services/PostgresService.js', async () => {
  const { postgresMock } = await import('./harness/mocks.js');
  return postgresMock();
});
vi.mock('../services/threadPersistenceService.js', async () => {
  return await import('./harness/fakeThreadStore.js');
});
vi.mock('../services/threadAccessService.js', async () => {
  const { threadAccessMock } = await import('./harness/mocks.js');
  return threadAccessMock();
});
vi.mock('../services/compactionService.js', async (orig) => {
  const { compactionMock } = await import('./harness/mocks.js');
  return compactionMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/attachmentPersistenceService.js', async (orig) => {
  const { attachmentPersistenceMock } = await import('./harness/mocks.js');
  return attachmentPersistenceMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pastChatRecallService.js', async (orig) => {
  const { pastChatRecallMock } = await import('./harness/mocks.js');
  return pastChatRecallMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/postResponseService.js', async (orig) => {
  const { postResponseMock } = await import('./harness/mocks.js');
  return postResponseMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pipelineStateStore.js', async () => {
  const { pipelineStateStoreMock } = await import('./harness/mocks.js');
  return pipelineStateStoreMock();
});
vi.mock('../services/sharepicEditService.js', async (orig) => {
  const { sharepicEditMock } = await import('./harness/mocks.js');
  return sharepicEditMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/agenticLoop/agenticRespondService.js', async (orig) => {
  const { fakeStreamAgenticResponse } = await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    streamAgenticResponse: fakeStreamAgenticResponse,
  };
});
vi.mock('../services/responseStreamingService.js', async (orig) => {
  const { fakeResolveModel, fakeStreamForResolution, fakeStreamWithFallback } =
    await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    resolveModel: fakeResolveModel,
    streamForResolution: fakeStreamForResolution,
    streamWithFallback: fakeStreamWithFallback,
  };
});

const { useChatApp } = await import('./harness/suite.js');
const { userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { classifierVerdict } = await import('./harness/aiWorkerPoolStub.js');
const { respond } = await import('./harness/respondScript.js');
const { sharepicControl } = await import('./harness/mocks.js');
const { NO_SHAREPIC_TO_EDIT_TEXT, APP_REDIRECT_TEXTS } =
  await import('../services/platformGating.js');

const suite = useChatApp();

/** Force the classifier's LLM tier to a chosen verdict. */
function scriptIntent(intent: string, extra: Record<string, unknown> = {}): void {
  suite.pool.script('chat_intent_classification', classifierVerdict({ intent, ...extra }));
}

describe('sharepic licence', () => {
  it('answers normally instead of minting a surprise sharepic', async () => {
    // An UNLICENSED sharepic intent can essentially only come from the LLM tier
    // or a secondaryIntent — a phrasing the heuristics read as "sharepic" names
    // one, and would therefore be licensed. That is the whole reason this gate
    // exists, so the prompt is deliberately one measured to reach the LLM tier.
    scriptIntent('sharepic');

    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Bereite die Kernaussage optisch auf')],
    });
    suite.pool.assertScriptsConsumed();

    expect(trace.fullText).toContain(NO_SHAREPIC_TO_EDIT_TEXT.slice(0, 40));
    expect(trace.sharepicGenerated).toBe(false);
    expect(respond.agenticCalls).toHaveLength(0);
  });

  it('answers normally when the thread does have a sharepic to edit', async () => {
    // The other branch of the same gate: sharepic-shaped, unlicensed, but there
    // IS something to edit and the edit lanes declined it. Answering beats
    // minting a surprise second one.
    sharepicControl.threadHasSharepic = true;
    scriptIntent('sharepic');

    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Bereite die Kernaussage optisch auf')],
    });
    suite.pool.assertScriptsConsumed();

    expect(trace.intent).toBe('direct');
    expect(trace.fullText).not.toContain(NO_SHAREPIC_TO_EDIT_TEXT.slice(0, 40));
    expect(trace.sharepicGenerated).toBe(false);
  });

  it('licenses the turn when the user names a sharepic', async () => {
    scriptIntent('sharepic');

    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erstelle ein Sharepic zur Windkraft')],
    });

    expect(trace.fullText).not.toContain(NO_SHAREPIC_TO_EDIT_TEXT.slice(0, 40));
  });

  it('reads the licence off the mention-free text, not the raw message', async () => {
    // `lastUserTextNoMentions` is the remove-form on purpose: a mention LABEL
    // like "@[Bild generieren](tool:image)" would false-positive the noun
    // patterns. The word here sits in the prose, so the licence must still hold.
    scriptIntent('sharepic');

    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('@[Recherche](tool:web_search) Erstelle ein Sharepic zur Windkraft')],
    });

    expect(trace.fullText).not.toContain(NO_SHAREPIC_TO_EDIT_TEXT.slice(0, 40));
  });

  it('drops an unlicensed sharepic secondaryIntent', async () => {
    scriptIntent('direct', { secondaryIntent: 'sharepic' });

    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erkläre mir kurz die Windkraft-Debatte')],
    });

    expect(trace.sharepicGenerated).toBe(false);
    expect(trace.sharepicVariants).toHaveLength(0);
  });
});

describe('negative action constraints', () => {
  // Every family in the router's `forbiddenBy` map, each with the artifact noun
  // the user forbade. One door that forgets to check cannot leak past this gate.
  const cases: Array<{ intent: string; prompt: string }> = [
    { intent: 'save_as_doc', prompt: 'Fasse das zusammen, aber erstelle kein Dokument.' },
    { intent: 'modify_doc', prompt: 'Erkläre den Text, aber ändere das Dokument nicht.' },
    { intent: 'share_doc', prompt: 'Sag mir Bescheid, aber teile das Dokument nicht.' },
    { intent: 'create_sheet', prompt: 'Rechne das durch, aber erstelle keine Tabelle.' },
    {
      intent: 'create_presentation',
      prompt: 'Gliedere das Thema, aber erstelle keine Präsentation.',
    },
    { intent: 'create_pdf', prompt: 'Formuliere den Text, aber erstelle kein PDF.' },
    { intent: 'modify_board', prompt: 'Beschreibe die Aufgaben, aber ändere das Board nicht.' },
    { intent: 'image', prompt: 'Beschreibe das Motiv, aber erstelle kein Bild.' },
  ];

  // Asserted on the OUTCOME, not on the intent value. Which tier resolves a
  // given phrasing is the classifier's business and shifts as its heuristics
  // change; what the user was promised is that the forbidden artifact does not
  // appear. Pinning the intent string here would make these tests fail on a
  // harmless heuristic tweak and pass on a real leak.
  it.each(cases)('produces no $intent artifact when the turn forbids it', async ({ prompt }) => {
    const { trace } = await runTurn(suite.baseUrl(), { messages: [userTurn(prompt)] });

    expect(trace.documentCreated).toBe(false);
    expect(trace.imageGenerated).toBe(false);
    expect(trace.sharepicGenerated).toBe(false);
    // A confirm card is a persistent action too — offering one is the softer
    // form of the same leak.
    expect(trace.confirmActions).toEqual([]);
  });

  it('demotes an artifact intent to direct, and only because it was forbidden', async () => {
    // The pair is the point: a gate that never fires at all would look exactly
    // like a gate that works, so the control run must reach the artifact path.
    scriptIntent('save_as_doc');
    const forbidden = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Halte die Ergebnisse fest, aber erstelle diesmal kein Dokument.')],
    });
    suite.pool.assertScriptsConsumed();
    expect(forbidden.trace.intent).toBe('direct');
    expect(forbidden.trace.documentCreated).toBe(false);

    suite.pool.reset();
    scriptIntent('save_as_doc');
    const allowed = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Halte die Ergebnisse fest und leg sie als Dokument ab.')],
    });
    suite.pool.assertScriptsConsumed();
    expect(allowed.trace.intent).not.toBe('direct');
  });
});

describe('platform gating', () => {
  it('redirects a sharepic request from the app instead of generating', async () => {
    scriptIntent('sharepic');

    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erstelle ein Sharepic zur Windkraft')],
      platform: 'app',
    });

    expect(trace.fullText).toContain(APP_REDIRECT_TEXTS.sharepic.slice(0, 40));
    expect(trace.sharepicGenerated).toBe(false);
  });
});
