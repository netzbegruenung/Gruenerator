/**
 * Ein Erstell-Auftrag ÜBER mitgebrachtem Material — durch den echten
 * Klassifikator, Router und Loop-Katalog, das Modell gescriptet.
 *
 * Live 15.10.2026: Eine PM als Paste-Chip und „wandle diese pm in einen
 * sharepic slider um" kamen als Textgliederung zurück, ohne Werkzeug. Zwei
 * Riegel standen hintereinander: der Anhang-Rückfall im Klassifikator machte
 * jeden Turn mit Anhang zu `produktion`, bevor eine Erstell-Regel lief, und
 * „wandle … um" war für `asksForSharepic` kein Auftrag. Derselbe Rückfall traf
 * Präsentation, Tabelle und PDF aus einem Anhang.
 *
 * Je Fall: wird das bestellte Artefakt gebaut, und sieht der Generator das
 * Material dieses Turns?
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sharepicCalls = vi.hoisted(() => [] as Array<{ background: string }>);

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});
vi.mock('../services/artifactGeneration.js', async (orig) => {
  const { artifactGenerationStub } = await import('./harness/artifactGeneratorStub.js');
  return artifactGenerationStub((await orig()) as Record<string, unknown>);
});
// Der Sharepic-Generator selbst (Creator, Review, Fotokatalog) läuft hier nicht:
// gefragt ist, OB er gerufen wird und welchen Hintergrund der echte
// `buildSharepicBackground` ihm mitgäbe.
vi.mock('../services/intentHandlers/sharepic.js', async (orig) => {
  const original = (await orig()) as typeof import('../services/intentHandlers/sharepic.js');
  return {
    ...original,
    runSharepicGeneration: async (opts: Parameters<typeof original.runSharepicGeneration>[0]) => {
      const background = await original.buildSharepicBackground(opts.state, null);
      sharepicCalls.push({ background: background ?? '' });
      opts.sse.send('sharepic_complete', { message: 'stub', variants: [], error: 'stub' });
      return { variants: [], failure: null };
    },
  };
});
vi.mock('../../../database/services/PostgresService.js', async () => ({
  getPostgresInstance: () => ({
    query: (sql: string) => {
      if (String(sql).includes('FROM chat_messages')) return Promise.resolve([]);
      throw new Error(`unexpected Postgres query: ${String(sql).slice(0, 300)}`);
    },
  }),
}));
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
vi.mock('../../../services/user/textFormRepository.js', async (orig) => {
  const { textFormMock } = await import('./harness/mocks.js');
  return textFormMock((await orig()) as Record<string, unknown>);
});
vi.mock('../../../services/skills/internalPrompts.js', async (orig) => {
  const { internalPromptsMock } = await import('./harness/mocks.js');
  return internalPromptsMock((await orig()) as Record<string, unknown>);
});
vi.mock('../../../services/trees/index.js', async (orig) => {
  const { treeBudgetMock } = await import('./harness/mocks.js');
  return treeBudgetMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pipelineStateStore.js', async () => {
  const { pipelineStateStoreMock } = await import('./harness/mocks.js');
  return pipelineStateStoreMock();
});
vi.mock('../services/sharepicEditService.js', async (orig) => {
  const { sharepicEditMock } = await import('./harness/mocks.js');
  return sharepicEditMock((await orig()) as Record<string, unknown>);
});
vi.mock('../agents/directSearch.js', async (orig) => {
  const stub = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    executeDirectSearch: stub.fakeExecuteDirectSearch,
    executeDirectWebSearch: stub.fakeExecuteDirectWebSearch,
    executeDirectExamplesSearch: stub.fakeExecuteDirectExamplesSearch,
    executeDirectPressemitteilungExamples: stub.fakeExecuteDirectPressemitteilungExamples,
  };
});
vi.mock('../../../services/document-services/DocumentSearchService/index.js', async (orig) => {
  const { fakeQdrantDocumentService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getQdrantDocumentService: fakeQdrantDocumentService,
  };
});
// Wie pasteOrderRouting: `ai` statt agenticRespondService ersetzen, damit der
// echte Loop-Katalog montiert wird.
vi.mock('ai', async (orig) => {
  const { fakeLoopStreamText, fakeLoopGenerateText } = await import('./harness/loopScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    streamText: fakeLoopStreamText,
    generateText: fakeLoopGenerateText,
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

const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createProviderStub } = await import('./harness/providerStub.js');
const { createJournalCapture } = await import('./harness/journalCapture.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');
const { generatorControl, resetGeneratorControl } =
  await import('./harness/artifactGeneratorStub.js');
const { PHANTOM_CREATION_FALLBACK } = await import('../services/outputSanity.js');

/** Erkennungszeichen des Materials: steht nur in der PM, nie im Auftrag. */
const MARKER = 'Kreisumlage';
const PM = [
  'Haushalt 2027: Grüne fordern Ende der kommunalen Unterfinanzierung',
  `Zur Vorlage des Haushaltsentwurfs, der eine Erhöhung der Allgemeinen ${MARKER} um einen Prozentpunkt vorsieht, nehmen die Grünen im Kreis Stellung.`,
  'Die Kreisvorsitzende erklärt: „Wir erkennen an, dass die Städte und Gemeinden am Rande ihrer Leistungsfähigkeit stehen. Ein striktes Sparprogramm reicht nicht mehr aus.“',
  'Wer heute bei Kitas, Schulen und sozialer Infrastruktur spart, riskiert einen Stillstand für kommende Generationen. Wir fordern eine grundlegende Neuausrichtung der Gemeindefinanzierung nach dem Prinzip: Wer bestellt, bezahlt.',
  'Ob Kita-Platz oder ärztliche Hilfe – die Menschen vor Ort müssen sich auf eine funktionierende Infrastruktur verlassen können. Deshalb tragen wir die Erhöhung mit, verlangen aber von Bund und Land eine faire Finanzierung der Aufgaben, die sie den Kommunen übertragen.',
].join('\n\n');

function pasteAttachment(text: string): Record<string, unknown> {
  return {
    name: 'Eingefügter Text.txt',
    type: 'text/plain',
    size: text.length,
    isImage: false,
    data: Buffer.from(text, 'utf8').toString('base64'),
  };
}

type Material = 'chip' | 'inline' | 'none';
type Built = 'sharepic' | 'presentation' | 'sheet' | 'pdf' | 'document' | null;

interface Case {
  id: string;
  prompt: string;
  material: Material;
  built: Built;
  /** Genannt statt bestellt: der Planer bekommt das Sharepic-Werkzeug ohne Zwang
   *  angeboten. Der gescriptete Planer ruft es nicht, also entsteht nichts —
   *  das prüft zugleich, dass nichts nachgeholt wird. */
  offered?: true;
}

const CASES: Case[] = [
  // Der Live-Fall.
  {
    id: 'chip-wandle-slider',
    prompt: 'wandle diese pm in einen sharepic slider um',
    material: 'chip',
    built: 'sharepic',
  },
  {
    id: 'chip-erstelle-sharepic',
    prompt: 'erstelle ein Sharepic aus dieser PM',
    material: 'chip',
    built: 'sharepic',
  },
  {
    id: 'chip-verwandle-karussell',
    prompt: 'verwandle die PM in ein Karussell',
    material: 'chip',
    built: 'sharepic',
  },
  { id: 'chip-slider', prompt: 'mach daraus einen Slider', material: 'chip', built: 'sharepic' },
  {
    id: 'chip-praesentation',
    prompt: 'mach daraus eine Präsentation',
    material: 'chip',
    built: 'presentation',
  },
  { id: 'chip-tabelle', prompt: 'erstelle daraus eine Tabelle', material: 'chip', built: 'sheet' },
  { id: 'chip-pdf', prompt: 'wandle das in ein PDF um', material: 'chip', built: 'pdf' },
  // Ohne eigenen Intent: der Router hebt den Turn mit dem Werkzeug in den Loop.
  { id: 'chip-dokument', prompt: 'mach daraus ein Dokument', material: 'chip', built: 'document' },
  {
    id: 'inline-wandle-slider',
    prompt: 'wandle diese pm in einen sharepic slider um',
    material: 'inline',
    built: 'sharepic',
  },
  // Verb und Nomen zu weit auseinander für die Bestell-Regex: das Wort gibt das
  // Werkzeug frei, ob es gerufen wird, entscheidet der Planer.
  {
    id: 'none-wandle-slider-lang',
    prompt: 'wandle unsere Forderungen zur Kitafinanzierung in einen Sharepic-Slider um',
    material: 'none',
    built: null,
    offered: true,
  },
  // Kontrollen ohne Material: diese Wege bauen schon vor der Reparatur.
  {
    id: 'none-erstelle-sharepic',
    prompt: 'erstelle ein Sharepic zu unseren Forderungen zur Kitafinanzierung',
    material: 'none',
    built: 'sharepic',
  },
  {
    id: 'none-praesentation',
    prompt: 'mach eine Präsentation zu unseren Forderungen zur Kitafinanzierung',
    material: 'none',
    built: 'presentation',
  },
  // Gegenproben: Textarbeit am Material und eine blosse Erwähnung bauen nichts.
  { id: 'chip-korrigieren', prompt: 'rechtschreibung korrigieren', material: 'chip', built: null },
  {
    id: 'chip-erwaehnung',
    prompt: 'kürze die PM auf die Hälfte. Dazu passt später ein Sharepic.',
    material: 'chip',
    built: null,
    offered: true,
  },
];

const ANSWER = { text: 'Hier ist die Fassung.' };

const pool = createProviderStub();
const capture = createJournalCapture();
let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  app = await startChatApp({ decisionJournal: capture.middleware });
  pinChatEnv();
  await runTurn(app.baseUrl, { messages: [userTurn('Hallo!')] });
}, 60_000);

afterAll(async () => {
  await app.close();
  restoreNetwork();
});

beforeEach(() => {
  pinChatEnv();
  resetThreadStore();
  resetMockControls();
  resetGeneratorControl();
  respond.reset();
  pool.reset();
  capture.reset();
  loopScript.reset();
  searchBackend.reset();
  sharepicCalls.length = 0;
});

function builtKind(): { kind: Built; material: string } | null {
  const sharepic = sharepicCalls.at(-1);
  if (sharepic) {
    return { kind: 'sharepic', material: sharepic.background };
  }
  const generated = generatorControl.calls.at(-1);
  if (!generated) return null;
  const kind = generated.generator === 'pdf' ? 'pdf' : (generated.kind as Built);
  return { kind, material: generated.userContent };
}

describe('an artifact order over the material the turn brings', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    loopScript.script(ANSWER, ANSWER);
    const prompt = c.material === 'inline' ? `${PM}\n\n${c.prompt}` : c.prompt;
    await runTurn(app.baseUrl, {
      messages: [userTurn(prompt)],
      ...(c.material === 'chip' ? { attachments: [pasteAttachment(PM)] } : {}),
    });

    const built = builtKind();
    expect(built?.kind ?? null, `${c.id}: built`).toBe(c.built);
    if (c.built && c.material !== 'none') {
      expect(built?.material ?? '', `${c.id}: the generator sees the material`).toContain(MARKER);
    }
    if (c.offered) {
      expect(loopScript.calls[0]?.toolNames ?? [], `${c.id}: sharepic on offer`).toContain(
        'sharepic'
      );
    }
  });
});

// Turn 2 des Live-Falls: ein Thread von vor der Reparatur, dessen freies
// Angebot („… Gib mir einfach kurz Bescheid!") nie gespeichert wurde. Das „ja"
// darauf baut nichts — dann darf die Antwort auch nichts ankündigen.
describe('„ja" on an offer that was never recorded', () => {
  const OFFER =
    'Kachel 1: Stoppt die kommunale Unterfinanzierung!\n\nDa du nach einem Sharepic-Format gefragt hast: Ich kann dir diese Kacheln direkt als fertige KI-Bilder oder Sharepics erstellen. Gib mir einfach kurz Bescheid, ob ich das übernehmen soll!';
  const PHANTOM =
    'Ich erstelle dir jetzt die Sharepics für den Slider basierend auf dem Entwurf. Da ein Slider aus mehreren Bildern besteht, generiere ich diese nacheinander für dich.\n\n(Hier erfolgt nun die Erstellung der Sharepics durch die entsprechenden Werkzeuge des Grünerators)';

  it('replaces the phantom announcement with an honest sentence', async () => {
    loopScript.script(ANSWER, { text: PHANTOM });
    respond.singlePassText = PHANTOM;
    const { trace } = await runTurn(app.baseUrl, {
      messages: [
        userTurn('wandle diese pm in einen sharepic slider um', 'm0'),
        { id: 'a0', role: 'assistant', parts: [{ type: 'text', text: OFFER }] },
        userTurn('ja mach das bitte', 'm1'),
      ],
    });
    expect(trace.fullText.trim()).toBe(PHANTOM_CREATION_FALLBACK);
  });
});
