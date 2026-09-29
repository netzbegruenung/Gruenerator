/**
 * Der erzwungene erste Planer-Schritt gegen das ECHTE Planer-Modell (#3880).
 *
 * Die Harness entscheidet alles bis zum Modell echt — Klassifikator, Router,
 * Werkzeugkatalog, `shouldForceFirstToolCall`, `forcedFirstStepTools` — und
 * fängt den ersten `streamText`-Aufruf des Planers ab. Genau dieser Schritt 0
 * geht dann zweimal an das Produktionsmodell der Planer-Lane
 * (`LOOP_PLANNER_PRIMARY`): einmal mit dem zugeschnittenen `activeTools` (dieser
 * Stand), einmal ohne (master: `required` über den ganzen Katalog, weil
 * `toolScope` im Schattenbetrieb läuft). Gezählt wird, welches Werkzeug der
 * Planer als erstes ruft. Kein Werkzeug läuft: die Aufrufe gehen ohne `execute`
 * hinaus.
 *
 * Kleiner als die Chat-Eval, weil nur der eine Schritt gemessen wird, den die
 * Änderung berührt — ohne Backend, Datenbank oder Keycloak.
 *
 * Läuft NUR mit `FORCE_LIVE=1` und einem echten `GREENPT_API_KEY`:
 *   FORCE_LIVE=1 GREENPT_API_KEY=… npx vitest run routes/chat/__integration__/forcedFirstStep.live.vitest.ts
 * Die Tabelle landet in `FORCE_LIVE_OUT` (Vorgabe: tmpdir), weil `console.log`
 * aus dem Lauf nicht ankommt. GreenPTs Kontingent teilt sich die Produktion —
 * ein Lauf sind CASES × 2 × REPS Aufrufe.
 */
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({
  captured: [] as Array<Record<string, unknown>>,
  /** Die Werkzeugschritte früherer Turns — der Fake-Store kennt keine. */
  priorSteps: [] as unknown[],
  /** Der Vorab-Seed der angehängten Dokumente findet nichts. */
  emptySeed: false,
}));

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});
// Eine Person ohne gespeicherte Inhalte, statt jeder Abfrage einen Fehler: der
// Rezeptkatalog soll montiert werden wie in Produktion.
vi.mock('../../../database/services/PostgresService.js', async () => ({
  getPostgresInstance: () => ({ query: () => Promise.resolve([]) }),
}));
vi.mock('../services/threadPersistenceService.js', async () => {
  const store = await import('./harness/fakeThreadStore.js');
  return {
    ...store,
    readThreadToolHistory: async (threadId: string) => ({
      ...(await store.readThreadToolHistory(threadId)),
      toolSteps: () => ctl.priorSteps,
      lastTurnToolSteps: () => ctl.priorSteps,
    }),
  };
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
vi.mock('../../../services/bundestag/BundestagEnrichedService.js', async (orig) => {
  const { fakeBundestagService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getBundestagEnrichedService: fakeBundestagService,
  };
});
vi.mock('../../../services/monitor/UmfragenService.js', async (orig) => {
  const { fakeLookupUmfragen } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    lookupUmfragen: fakeLookupUmfragen,
  };
});
vi.mock('../../../services/document-services/DocumentSearchService/index.js', async (orig) => {
  const { fakeQdrantDocumentService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getQdrantDocumentService: () =>
      ctl.emptySeed
        ? {
            search: () => Promise.resolve({ results: [] }),
            getMultipleDocumentsFullText: () => Promise.resolve({ documents: [] }),
          }
        : fakeQdrantDocumentService(),
  };
});
// Jeder Loop-Aufruf wird nur aufgezeichnet und endet mit Text: der Zug läuft
// zu Ende, das Modell sieht erst der Test — und nur den ersten Schritt.
vi.mock('ai', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  streamText: (options: Record<string, unknown>) => {
    ctl.captured.push(options);
    return {
      stream: (async function* () {
        yield { type: 'text-delta', text: 'Eine Antwort.' };
      })(),
    };
  },
  generateText: () => Promise.resolve({ text: '' }),
}));
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

const { generateText } = await vi.importActual<typeof import('ai')>('ai');
const { LOOP_PLANNER_PRIMARY } = await import('../agents/autoPolicy.js');
const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { createProviderStub } = await import('./harness/providerStub.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');

const LIVE = process.env.FORCE_LIVE === '1';
// Vor `pinChatEnv` gelesen, das den Schlüssel sonst leert.
const GREENPT_KEY = process.env.GREENPT_API_KEY ?? '';
const REPS = 3;
const OUT = process.env.FORCE_LIVE_OUT ?? path.join(os.tmpdir(), 'forced-first-step-live.md');

const PASTE = [
  'Windkraft an Land: 2025 wurden in Deutschland 1.200 neue Anlagen mit zusammen 5,1 Gigawatt errichtet.',
  'Der Anteil erneuerbarer Energien am Bruttostromverbrauch lag damit bei 62 Prozent.',
  'Die Genehmigungsdauer sank laut Branchenverband auf durchschnittlich 18 Monate.',
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

const BUERGERANFRAGE = [
  'Sehr geehrte Damen und Herren,',
  'in unserer Straße wird seit Monaten zu schnell gefahren. Wie stehen die Grünen zu Tempo 30 innerorts, und was tun Sie konkret dafür?',
  'Mit freundlichen Grüßen, Petra Lindner',
].join('\n\n');

interface Case {
  id: string;
  prompt: string;
  body?: Record<string, unknown>;
  /** Ein Turn davor im selben Thread, und welche Werkzeuge er rief. */
  before?: { prompt: string; steps: string[] };
  emptySeed?: boolean;
  /** Die Werkzeuge, die als ERSTER Aufruf zum Auftrag passen. */
  fits: readonly string[];
}

function priorStep(toolName: string): Record<string, unknown> {
  return {
    toolCallId: `prior-${toolName}`,
    toolName,
    args: { query: 'SPD Heizungsgesetz Abstimmung' },
    result: { results: [{ title: 'Gebäudeenergiegesetz — namentliche Abstimmung' }] },
  };
}

const CASES: Case[] = [
  {
    id: 'recherche',
    prompt: 'recherchiere aktuelle Zahlen zum Windkraftausbau in Deutschland',
    fits: ['web_search'],
  },
  {
    id: 'paste-recherche',
    prompt: 'stimmen die Zahlen im Text? recherchiere das',
    body: { attachments: [pasteAttachment(PASTE)] },
    fits: ['web_search'],
  },
  {
    id: 'grundsatzprogramm',
    prompt: 'Was steht im Grundsatzprogramm der Grünen zum Tierschutz?',
    fits: ['gruenerator_search'],
  },
  {
    id: 'meine-dokumente',
    prompt: 'such in meinen Dokumenten nach dem Antrag zur Radverkehrsstrategie',
    fits: ['documents', 'find_content'],
  },
  {
    id: 'bundestag',
    prompt: 'Wie hat die Unionsfraktion im Bundestag über das Heizungsgesetz abgestimmt?',
    fits: ['bundestag', 'abgeordnetenwatch'],
  },
  // Der Messpunkt `followup-bundestag-scope`: zwei Abnahmeläufe, fünf
  // verschiedene Werkzeugwahlen für dieselbe Anschlussfrage.
  {
    id: 'anschlussfrage',
    before: {
      prompt: 'Wie hat die SPD zum Heizungsgesetz abgestimmt?',
      steps: ['abgeordnetenwatch'],
    },
    prompt: 'Und die FDP?',
    fits: ['abgeordnetenwatch', 'bundestag', 'web_search'],
  },
  // Der Seed findet im Anhang nichts — der Fall, den das Review fand.
  {
    id: 'pdf-seed-leer',
    prompt: 'erstelle daraus eine tabelle',
    body: { documentChatIds: ['doc-1'] },
    emptySeed: true,
    fits: ['dokumente_lesen'],
  },
  // Die Familie von #3878: Einfügung plus Composer-Notebook.
  {
    id: 'nb-buergeranfrage',
    prompt: 'beantworte diese Bürgeranfrage mit unseren Positionen',
    body: {
      attachments: [pasteAttachment(BUERGERANFRAGE)],
      defaultNotebookId: 'bundestagsfraktion-notebook',
    },
    fits: ['gruenerator_search', 'notebooks', 'notebook_quellen'],
  },
];

interface Row {
  id: string;
  forced: string;
  narrowed: readonly string[] | null;
  mounted: number;
  master: string[];
  branch: string[];
}

const rows: Row[] = [];

type PrepareStep = (arg: { stepNumber: number; steps?: [] }) => {
  toolChoice?: unknown;
  system?: string;
  activeTools?: readonly string[];
};

/** Ohne `execute`: der Planer darf wählen, ausgeführt wird nichts. */
function withoutExecute(tools: Record<string, object>): Record<string, object> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [name, { ...t, execute: undefined }])
  );
}

async function firstCall(
  planner: Record<string, unknown>,
  step0: ReturnType<PrepareStep>,
  activeTools: readonly string[] | null
): Promise<string> {
  const result = await generateText({
    model: planner.model as Parameters<typeof generateText>[0]['model'],
    system: step0.system ?? (planner.system as string),
    messages: planner.messages as Parameters<typeof generateText>[0]['messages'] & object,
    tools: withoutExecute(planner.tools as Record<string, object>) as never,
    toolChoice: 'required',
    ...(activeTools && { activeTools: [...activeTools] as never }),
    ...(typeof planner.temperature === 'number' && { temperature: planner.temperature }),
    ...(typeof planner.maxOutputTokens === 'number' && {
      maxOutputTokens: planner.maxOutputTokens,
    }),
  });
  return result.toolCalls.map((c) => c.toolName).join('+') || '(keins)';
}

/** Wie oft der ERSTE gerufene Name zum Auftrag passt. */
function fitCount(picks: string[], fits: readonly string[]): number {
  return picks.filter((p) => fits.includes(p.split('+')[0] ?? '')).length;
}

function render(): string {
  const count = (picks: string[], fits: readonly string[]) =>
    `${fitCount(picks, fits)}/${picks.length}`;
  const lines = [
    `# Erzwungener erster Schritt, live — ${LOOP_PLANNER_PRIMARY.provider}/${LOOP_PLANNER_PRIMARY.model}, ${REPS} Wiederholungen`,
    '',
    '| Fall | Zwang | Katalog | Zuschnitt | passt master | passt Zuschnitt | master | Zuschnitt |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const fits = CASES.find((c) => c.id === r.id)?.fits ?? [];
    lines.push(
      `| ${r.id} | ${r.forced} | ${r.mounted} | ${r.narrowed ? r.narrowed.join(', ') : '—'} | ` +
        `${count(r.master, fits)} | ${count(r.branch, fits)} | ${r.master.join(', ')} | ${r.branch.join(', ')} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

describe.runIf(LIVE)('forced first planner step — live', () => {
  const pool = createProviderStub();
  let app: Awaited<ReturnType<typeof startChatApp>>;

  beforeAll(async () => {
    app = await startChatApp();
  }, 60_000);

  afterAll(async () => {
    writeFileSync(OUT, render(), 'utf8');
    await app?.close();
  });

  beforeEach(() => {
    pinChatEnv({ GREENPT_API_KEY: GREENPT_KEY });
    resetThreadStore();
    resetMockControls();
    respond.reset();
    pool.reset();
    searchBackend.reset();
    ctl.captured.length = 0;
    ctl.priorSteps = [];
    ctl.emptySeed = false;
  });

  it.each(CASES.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      ctl.emptySeed = c.emptySeed ?? false;
      if (c.before) {
        const first = await runTurn(app.baseUrl, {
          messages: [userTurn(c.before.prompt)],
          ...c.body,
        });
        ctl.priorSteps = c.before.steps.map(priorStep);
        ctl.captured.length = 0;
        await runTurn(app.baseUrl, {
          messages: [
            userTurn(c.before.prompt, 'm1'),
            { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Eine Antwort.' }] },
            userTurn(c.prompt, 'm2'),
          ],
          threadId: first.trace.threadId,
          ...c.body,
        });
      } else {
        await runTurn(app.baseUrl, { messages: [userTurn(c.prompt)], ...c.body });
      }

      const planner = ctl.captured[0];
      expect(planner, `${c.id}: der Zug erreichte den Loop nicht`).toBeDefined();
      if (!planner) return;
      const model = planner.model as { modelId?: string };
      expect(model.modelId, `${c.id}: nicht die Produktions-Lane des Planers`).toBe(
        LOOP_PLANNER_PRIMARY.model
      );

      const prepare = planner.prepareStep as PrepareStep;
      const step0 = prepare({ stepNumber: 0, steps: [] });
      // Ohne Schattenbetrieb hätte master schon einen Zuschnitt gehabt — dann
      // verglichen die zwei Arme nicht mehr master gegen diesen Stand.
      expect(prepare({ stepNumber: 1, steps: [] }).activeTools).toBeUndefined();

      const row: Row = {
        id: c.id,
        forced:
          typeof step0.toolChoice === 'string'
            ? step0.toolChoice
            : JSON.stringify(step0.toolChoice ?? null),
        narrowed: step0.activeTools ?? null,
        mounted: Object.keys(planner.tools as object).length,
        master: [],
        branch: [],
      };
      rows.push(row);
      expect.soft(step0.toolChoice, `${c.id}: kein Zwang ohne benanntes Werkzeug`).toBe('required');
      if (step0.toolChoice !== 'required') return;

      for (let i = 0; i < REPS; i++) {
        row.master.push(await firstCall(planner, step0, null));
        row.branch.push(await firstCall(planner, step0, step0.activeTools ?? null));
      }
      // Zugesichert wird, was die Änderung behauptet — nie schlechter als der
      // volle Katalog —, nicht Fehlerfreiheit: das Modell streut auch im
      // Zuschnitt, und die Tabelle zeigt wie.
      expect
        .soft(
          fitCount(row.branch, c.fits),
          `${c.id}: Zuschnitt [${row.branch.join(', ')}] gegen master [${row.master.join(', ')}]`
        )
        .toBeGreaterThanOrEqual(fitCount(row.master, c.fits));
    },
    180_000
  );
});
