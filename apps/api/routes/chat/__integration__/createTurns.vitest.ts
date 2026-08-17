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
const { messagesOf, threads } = await import('./harness/fakeThreadStore.js');
const { generatorControl, resetGeneratorControl, STUB_BOARD_ID, STUB_DOC_ID, STUB_PDF_ID } =
  await import('./harness/artifactGeneratorStub.js');

const suite = useChatApp();

beforeEach(() => {
  resetGeneratorControl();
});

/**
 * Every create kind, keyed by the mention token that forces it.
 *
 * The prompts are chosen to carry NO research signal, and that is load-bearing:
 * a create ask that also asks for research is a COMPOUND turn by design — it
 * goes through the loop with a generation fat tool instead of through this
 * stage, and the three kinds marked `skipOnAgentic` are skipped here on
 * purpose. The compound boundary gets its own scenario below rather than
 * accidentally deciding these.
 */
const MENTION_CASES = [
  {
    token: 'dokument-erstellen',
    prompt: 'Fass das als Dokument zusammen',
    generator: 'doc' as const,
    kind: 'document',
    expectCard: true,
    textIncludes: 'Dokument',
    artifactId: STUB_DOC_ID,
  },
  {
    token: 'sheet-erstellen',
    prompt: 'Erstelle eine Tabelle zu Solarenergie',
    generator: 'doc' as const,
    kind: 'sheet',
    expectCard: true,
    textIncludes: 'Tabelle',
    artifactId: STUB_DOC_ID,
  },
  {
    token: 'praesentation-erstellen',
    prompt: 'Bau daraus einen Foliensatz',
    generator: 'doc' as const,
    kind: 'presentation',
    expectCard: true,
    textIncludes: 'Präsentation',
    artifactId: STUB_DOC_ID,
  },
  {
    token: 'pdf-erstellen',
    prompt: 'Mach ein PDF daraus',
    generator: 'pdf' as const,
    expectCard: true,
    textIncludes: 'PDF',
    artifactId: STUB_PDF_ID,
  },
  {
    // The board is the one kind WITHOUT a `document_created` card: the client
    // seeds Yjs from the `done` payload instead. A scenario that expected a
    // card here would be asserting a bug — so this one checks the `done`
    // payload, which is the board's only channel.
    token: 'board-erstellen',
    prompt: 'Mach ein Board mit den Aufgaben',
    generator: 'board' as const,
    expectCard: false,
    textIncludes: 'Board',
    doneKey: 'boardId',
    doneValue: STUB_BOARD_ID,
  },
] as const;

describe('create turns — the mention door', () => {
  for (const c of MENTION_CASES) {
    it(`@${c.token} creates the artifact and owns the turn`, async () => {
      const { trace, events } = await runTurn(suite.baseUrl(), {
        messages: [userTurn(c.prompt)],
        forcedTools: [c.token],
      });

      assertEventOrder(events);

      // The generator ran exactly once, through the expected entry point.
      expect(generatorControl.calls).toHaveLength(1);
      expect(generatorControl.calls[0]?.generator).toBe(c.generator);
      if ('kind' in c) expect(generatorControl.calls[0]?.kind).toBe(c.kind);

      // The turn is OWNED: a create path never hands off to the generic
      // responder, so the confirmation text is the whole answer.
      expect(trace.fullText).toContain(c.textIncludes);
      expect(trace.fullText).toContain('erstellt');

      expect(trace.documentCreated).toBe(c.expectCard);
      if ('artifactId' in c) expect(trace.artifactIds).toContain(c.artifactId);
      if ('doneKey' in c) {
        const done = events.find((e) => e.event === 'done');
        expect(done?.data[c.doneKey]).toBe(c.doneValue);
      }

      // `response_start` opens at the COMMIT point, not eagerly — the stub
      // calls onCommit exactly where the real generator does.
      const names = events.map((e) => e.event);
      expect(names).toContain('response_start');
      expect(names.filter((n) => n === 'done')).toHaveLength(1);
    });
  }
});

describe('create turns — where the compound boundary runs', () => {
  it('hands a research+create ask to the loop instead of this stage', async () => {
    // The same mention, the same artifact — but the ask now names research, so
    // `compoundGenerationKind` claims the turn and the loop builds the sheet
    // with its fat tool. The pipeline route is skipped (`skipOnAgentic`), and
    // that is the intended split, not a missed dispatch.
    //
    // Pinned as a scenario because it is the one place where a create mention
    // does NOT reach the create handler: anything that moves this boundary
    // silently changes which of two generators runs.
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Recherchiere die Zahlen und erstelle eine Tabelle dazu')],
      forcedTools: ['sheet-erstellen'],
    });

    expect(generatorControl.calls).toHaveLength(0);
    expect(trace.documentCreated).toBe(false);
  });
});

describe('create turns — the classified-intent door', () => {
  const INTENT_CASES = [
    { prompt: 'Erstelle eine Tabelle zu den Mitgliederzahlen', generator: 'doc', kind: 'sheet' },
    {
      prompt: 'Erstelle eine Präsentation zur Verkehrswende',
      generator: 'doc',
      kind: 'presentation',
    },
  ] as const;

  for (const c of INTENT_CASES) {
    it(`reaches the ${c.kind} handler without a mention`, async () => {
      const { trace, events } = await runTurn(suite.baseUrl(), {
        messages: [userTurn(c.prompt)],
      });

      assertEventOrder(events);
      expect(generatorControl.calls).toHaveLength(1);
      expect(generatorControl.calls[0]?.generator).toBe(c.generator);
      expect(generatorControl.calls[0]?.kind).toBe(c.kind);
      expect(trace.documentCreated).toBe(true);
    });
  }
});

describe('create turns — the brief the generator receives', () => {
  it('frames the thread transcript ahead of the order', async () => {
    // The enrichment is the fix from #2136: without it "mach ein PDF daraus"
    // reaches the generator as exactly that sentence and the answer it points
    // at is structurally invisible.
    // `@dokument-erstellen` rather than the PDF mention: the document route is
    // the one that runs whatever the loop gate decided (`skipOnAgentic: false`),
    // so this scenario measures the BRIEF and stays out of the compound
    // question the scenario above owns.
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [
        userTurn('Wie viele Windräder stehen in Brandenburg?', 'm0'),
        userTurn('Fass das als Dokument zusammen', 'm1'),
      ],
      forcedTools: ['dokument-erstellen'],
    });

    expect(trace.error).toBeNull();
    const brief = generatorControl.calls[0]?.userContent ?? '';
    expect(brief).toContain('BISHERIGES GESPRÄCH');
    expect(brief).toContain('Windräder');
    // The brief goes LAST — it is what the turn is for.
    expect(brief.indexOf('AUFTRAG:')).toBeGreaterThan(brief.indexOf('BISHERIGES GESPRÄCH'));
  });
});

describe('create turns — failure still owns the turn', () => {
  it('explains the failure in-stream instead of falling through', async () => {
    // Handing a failed create back to the generic responder is what let it
    // invent "copy this into the Office app and export as PDF" — prose that
    // then became the next artifact's input.
    generatorControl.docOk = false;

    const { trace, events } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erstelle eine Tabelle zu Solarenergie')],
      forcedTools: ['sheet-erstellen'],
    });

    assertEventOrder(events);
    expect(trace.documentCreated).toBe(false);
    expect(trace.artifactIds).toHaveLength(0);
    // The kind-specific failure text, not a generic error.
    expect(trace.fullText).toContain('Tabelle nicht erstellen');
  });

  it('reports a thrown generator with the kind-specific error text', async () => {
    generatorControl.docThrows = true;

    const { trace, events } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erstelle eine Tabelle zu Solarenergie')],
      forcedTools: ['sheet-erstellen'],
    });

    assertEventOrder(events);
    expect(trace.documentCreated).toBe(false);
    expect(trace.fullText).toContain('Tabelle konnte nicht erstellt werden');
  });
});

describe('create turns — what the next turn inherits', () => {
  it('persists the card metadata and the sticky artifact pointer', async () => {
    // Both halves matter for the FOLLOW-UP turn: the persisted
    // `createdDocument` rehydrates the card on reload, and the sticky pointer
    // is what makes "ändere die Tabelle" find a target at all.
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erstelle eine Tabelle zu Solarenergie')],
      forcedTools: ['sheet-erstellen'],
    });

    const threadId = trace.threadId;
    expect(threadId).not.toBeNull();

    const assistant = messagesOf(threadId as string)
      .filter((m) => m.role === 'assistant')
      .at(-1);
    expect(assistant?.metadata).toMatchObject({
      intent: 'create_sheet',
      createdDocument: { documentId: STUB_DOC_ID },
    });
    expect(threads.get(threadId as string)?.lastToolContext).toMatchObject({
      kind: 'sheet',
      ref: STUB_DOC_ID,
    });
  });
});
