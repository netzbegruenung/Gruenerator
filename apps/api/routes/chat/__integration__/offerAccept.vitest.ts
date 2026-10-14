/**
 * What an artifact-creating turn puts on the wire — one scenario per kind.
 *
 * These paths had no integration cover at all: the only create-shaped scenarios
 * in this directory assert a NEGATION ("erstelle kein Dokument"), so every
 * guarantee on the success side — the SSE order, the card, the confirmation
 * text, the `done` extras, the persisted metadata and the sticky artifact
 * pointer — rested on unit tests of the pieces and on nothing that runs the
 * router end to end.
 *
 * That matters because all five kinds share ONE choreography (`runCreateTurn`)
 * and differ only in a descriptor (`artifactKinds.ts`). A single scaffold means
 * a single mutation can break all five at once, and per-kind unit tests of the
 * descriptors cannot see it. These scenarios are the net under that scaffold:
 * they are deliberately about the CONTRACT (which events, in which order, with
 * which payload keys), not about generated content — the generator is stubbed.
 *
 * Both doors are driven, because they are separate dispatchers: the four
 * `@…-erstellen` mentions arrive as `forcedTools` and are matched by token,
 * while `create_sheet`/`create_presentation`/`create_pdf` can also arrive as a
 * classified intent. A scenario per door is what keeps the two from drifting.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});

vi.mock('../services/artifactGeneration.js', async (orig) => {
  const { artifactGenerationStub } = await import('./harness/artifactGeneratorStub.js');
  return artifactGenerationStub((await orig()) as Record<string, unknown>);
});

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
const { runTurn, assertEventOrder } = await import('./harness/trace.js');
const { createThread, createMessage, createPendingAssistantMessage, finalizeAssistantMessage } =
  await import('./harness/fakeThreadStore.js');
const { TEST_USER } = await import('./harness/fakeUser.js');
const { generatorControl, resetGeneratorControl } =
  await import('./harness/artifactGeneratorStub.js');

/**
 * Das knappe „ja" auf ein Artefakt-Angebot (#4367).
 *
 * Der Turn davor endete mit „Soll ich daraus eine Präsentation machen?" und
 * hat die Art als `metadata.offer` gespeichert. Ohne den Annahme-Zweig im
 * Klassifikator verließ „ja gern" die Leiter als Kurztext (`direct`, kein
 * Werkzeug), und das Modell beschrieb Folien als Text oder erfand Vorlagen.
 */
const suite = useChatApp();

beforeEach(() => {
  resetGeneratorControl();
});

const SPEECH =
  'Liebe Freund*innen, die Verkehrswende beginnt vor unserer Haustür: sichere Radwege, ein Bus im Takt und ein Klimaticket, das sich alle leisten können.';

async function threadWithOffer(offer: Record<string, unknown> | null, answer: string) {
  const thread = await createThread(TEST_USER.id, 'gruenerator-universal', 'Angebot');
  await createMessage(thread.id, 'user', 'Schreib mir eine kurze Rede zur Verkehrswende');
  const assistantId = await createPendingAssistantMessage(thread.id);
  await finalizeAssistantMessage(assistantId, answer, {
    intent: 'produktion',
    ...(offer && { offer }),
  });
  return thread.id;
}

async function reply(threadId: string, answer: string, text: string) {
  return runTurn(suite.baseUrl(), {
    threadId,
    messages: [
      userTurn('Schreib mir eine kurze Rede zur Verkehrswende', 'm0'),
      { id: 'a0', role: 'assistant', parts: [{ type: 'text', text: answer }] },
      userTurn(text, 'm1'),
    ],
  });
}

describe('accepting an artifact offer', () => {
  const answer = `${SPEECH}\n\nSoll ich daraus eine Präsentation machen?`;

  it.each(['ja', 'ja gern', 'Ja bitte, mach das'])(
    '„%s" builds the offered presentation from the previous answer',
    async (text) => {
      const threadId = await threadWithOffer({ kind: 'presentation' }, answer);
      const { trace, events } = await reply(threadId, answer, text);

      assertEventOrder(events);
      expect(generatorControl.calls).toHaveLength(1);
      expect(generatorControl.calls[0]?.kind).toBe('presentation');
      expect(generatorControl.calls[0]?.userContent).toContain('sichere Radwege');
      expect(trace.documentCreated).toBe(true);
    }
  );

  it('builds an offered document, a kind without its own intent', async () => {
    const docAnswer = `${SPEECH}\n\nSoll ich daraus ein Dokument machen, das du bearbeiten und teilen kannst?`;
    const threadId = await threadWithOffer({ kind: 'document' }, docAnswer);
    const { trace } = await reply(threadId, docAnswer, 'ja gern');

    expect(generatorControl.calls).toHaveLength(1);
    expect(generatorControl.calls[0]?.generator).toBe('doc');
    expect(trace.documentCreated).toBe(true);
  });

  it.each(['nein danke', 'ja, aber kürzer'])('„%s" builds nothing', async (text) => {
    const threadId = await threadWithOffer({ kind: 'presentation' }, answer);
    await reply(threadId, answer, text);
    expect(generatorControl.calls).toHaveLength(0);
  });

  it('„ja" without a recorded offer builds nothing', async () => {
    const threadId = await threadWithOffer(null, answer);
    await reply(threadId, answer, 'ja gern');
    expect(generatorControl.calls).toHaveLength(0);
  });
});
