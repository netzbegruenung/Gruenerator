/**
 * Der erzwungene erste Planer-Schritt (#3880), echte Turns bis zum Modell.
 *
 * Die Harness entscheidet alles bis zum Modell echt — Klassifikator, Router,
 * Werkzeugkatalog, `shouldForceFirstToolCall`, `forcedFirstStepTools` — und
 * fängt den ersten `streamText`-Aufruf des Planers ab. Zwei Stufen:
 *
 * IMMER (CI): jeder Fall muss den ersten Schritt erzwingen, ein passendes
 * Werkzeug erreichbar halten und keinen der Köder zeigen, zu denen der Planer
 * unter dem vollen Katalog griff (`media`, `read_pdf_form`, `summarize` …).
 *
 * LIVE (`FORCE_LIVE=1` + die Anbieter-Schlüssel): derselbe Schritt 0 geht
 * zweimal an die Planer-Lane (`LOOP_PLANNER_PRIMARY`) — mit dem Zuschnitt und
 * ohne (master: `required` über den ganzen Katalog, weil `toolScope` im
 * Schattenbetrieb läuft). Gezählt wird, welches Werkzeug der Planer als erstes
 * ruft; kein Werkzeug läuft, die Aufrufe gehen ohne `execute` hinaus. Kleiner
 * als die Chat-Eval, weil nur der eine Schritt gemessen wird, den die Änderung
 * berührt. `FORCE_LIVE_MODELS=provider/model,…` legt denselben Schritt statt
 * der Lane jedem genannten Modell vor — der Prüfstand für einen Modellwechsel.
 *   FORCE_LIVE=1 MELIOUS_API_KEY=… npx vitest run routes/chat/__integration__/forcedFirstStep.vitest.ts
 * Die Tabelle landet in `FORCE_LIVE_OUT` (Vorgabe: tmpdir), weil `console.log`
 * aus dem Lauf nicht ankommt. Die Kontingente teilen sich die Produktion —
 * ein Lauf sind CASES × Modelle × 2 × REPS Aufrufe.
 *
 * Der Fake-Store kennt keine Werkzeugschritte früherer Turns (#3891); die
 * Anschlussfälle legen sie über `ctl.priorSteps` selbst hinein.
 */
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
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
const { getModel } = await import('../agents/providers.js');
const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createProviderStub } = await import('./harness/providerStub.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');

const LIVE = process.env.FORCE_LIVE === '1';
// Vor `pinChatEnv` gelesen, das die Schlüssel sonst leert.
const LIVE_KEYS = Object.fromEntries(
  [
    'MELIOUS_API_KEY',
    'GREENPT_API_KEY',
    'MISTRAL_API_KEY',
    'CORTECS_API_KEY',
    'REGOLO_API_KEY',
  ].map((k) => [k, process.env[k] ?? ''])
);
/**
 * Welche Modelle den Schritt 0 bekommen, als `provider/model` mit Komma
 * getrennt — jedes über dasselbe `getModel` wie der Loop. Leer: nur die
 * Planer-Lane, die der Zug selbst wählte.
 */
const MODEL_SPECS = (process.env.FORCE_LIVE_MODELS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
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

/**
 * Die Werkzeuge, zu denen der Planer unter `required` über den vollen Katalog
 * griff (#3880 und die Live-Messung dazu) — keins davon holt, was ein
 * erzwungener Schritt holen soll.
 */
const DECOYS = [
  'media',
  'find_content',
  'read_artifact',
  'summarize',
  'read_pdf_form',
  'rezept_laden',
  'meine_inhalte_laden',
];

interface Case {
  id: string;
  prompt: string;
  body?: Record<string, unknown>;
  locale?: 'de-AT';
  /** Ein Turn davor im selben Thread, welche Werkzeuge er rief, und ob sie scheiterten. */
  before?: { prompt: string; steps: string[]; failed?: boolean };
  emptySeed?: boolean;
  /** Die Werkzeuge, die als ERSTER Aufruf zum Auftrag passen. */
  fits: readonly string[];
  /** Was der erzwungene Schritt NICHT zeigen darf. Vorgabe: `DECOYS`. */
  without?: readonly string[];
}

function priorStep(toolName: string, i: number, before: NonNullable<Case['before']>) {
  return {
    toolCallId: `prior-${i}`,
    toolName,
    args: { query: before.prompt },
    ...(before.failed
      ? { ok: false as const, result: { error: 'Keine Treffer.' } }
      : { result: { results: [{ title: 'Ein Treffer zur Frage davor' }] } }),
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
  // Die eigenen Inhalte öffnen ihre ganze Gruppe — `media` und `read_artifact`
  // gehören hier dazu.
  {
    id: 'meine-dokumente',
    prompt: 'such in meinen Dokumenten nach dem Antrag zur Radverkehrsstrategie',
    fits: ['documents', 'find_content'],
    without: ['summarize', 'read_pdf_form', 'rezept_laden', 'meine_inhalte_laden'],
  },
  // Österreich: die Bundestags-Werkzeuge sind nicht montiert, die Websuche bleibt.
  {
    id: 'recherche-at',
    locale: 'de-AT',
    prompt: 'recherchiere die aktuelle Arbeitslosenquote in Österreich',
    fits: ['web_search'],
    without: [...DECOYS, 'bundestag'],
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
  // Parteiwechsel nach einer Programmsuche: die Antwort steht nicht im
  // Grünen-Korpus, der Schritt muss hinaus können.
  {
    id: 'anschlussfrage-partei',
    before: {
      prompt: 'Was steht in unserem Wahlprogramm zum Mindestlohn?',
      steps: ['gruenerator_search'],
    },
    prompt: 'Und was sagt die SPD dazu?',
    fits: ['web_search'],
  },
  // Das Protokoll aus #3778: zweimal `notebooks` gescheitert, dann „finde es".
  // `research_order` feuert vor `followup`, das gescheiterte Werkzeug muss
  // wiederholbar bleiben. Passend sind auch die zwei anderen Wege zur
  // Systemsammlung „berlin": `gruenerator_search` durchsucht sie,
  // `notebook_quellen` listet ihre Quellen nach Datum — genau „die letzte
  // Pressemitteilung". Gemma wählt unter dem vollen Katalog das zweite.
  {
    id: 'finde-es',
    before: {
      prompt: 'was stand in der letzen pressemitteilung im notebook berlin',
      steps: ['notebooks', 'notebooks'],
      failed: true,
    },
    prompt: 'finde es',
    fits: ['notebooks', 'gruenerator_search', 'notebook_quellen'],
  },
  // Der Seed findet im Anhang nichts — der Fall, den das Review fand (#3888).
  {
    id: 'pdf-seed-leer',
    prompt: 'erstelle daraus eine tabelle',
    body: { documentChatIds: ['doc-1'] },
    emptySeed: true,
    fits: ['dokumente_lesen'],
  },
  {
    id: 'pdf-seed-leer-frage',
    prompt: 'welche Forderungen stehen in dem Dokument?',
    body: { documentChatIds: ['doc-1'] },
    emptySeed: true,
    fits: ['dokumente_lesen'],
  },
  // Hier passt der Programmabgleich ebenso wie das Dokument.
  {
    id: 'pdf-seed-leer-vergleich',
    prompt: 'vergleiche das Dokument mit unserem Wahlprogramm',
    body: { documentChatIds: ['doc-1'] },
    emptySeed: true,
    fits: ['dokumente_lesen', 'gruenerator_search'],
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
  model: string;
  narrowed: readonly string[] | null;
  mounted: number;
  master: string[];
  branch: string[];
  masterMs: number[];
  branchMs: number[];
}

const rows: Row[] = [];

type PrepareStep = (arg: { stepNumber: number; steps?: [] }) => {
  toolChoice?: unknown;
  system?: string;
  activeTools?: readonly string[];
};

/** Ohne `execute`: der Planer darf wählen, ausgeführt wird nichts. */
function withoutExecute(tools: ToolSet): ToolSet {
  // Grenz-Cast: ein Werkzeug ohne `execute` ist gewollt — das SDK gibt den
  // Aufruf dann nur zurück.
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [name, { ...t, execute: undefined }])
  ) as ToolSet;
}

/**
 * Ein Aufruf, als erster Werkzeugname — oder `!<Fehler>`: ein Modell, das den
 * Zwang ablehnt oder ausfällt, ist ein Messwert, kein Abbruch des Laufs.
 */
async function firstCall(
  planner: Record<string, unknown>,
  model: LanguageModel,
  step0: ReturnType<PrepareStep>,
  activeTools: readonly string[] | null
): Promise<{ pick: string; ms: number }> {
  const started = performance.now();
  try {
    // Die Optionen stammen aus dem abgefangenen `streamText`-Aufruf des Loops —
    // die Casts sind die Grenze zu `Record<string, unknown>`.
    const result = await generateText({
      model,
      system: step0.system ?? (planner.system as string),
      messages: planner.messages as ModelMessage[],
      tools: withoutExecute(planner.tools as ToolSet),
      toolChoice: 'required',
      ...(activeTools && { activeTools: [...activeTools] }),
      ...(typeof planner.temperature === 'number' && { temperature: planner.temperature }),
      ...(typeof planner.maxOutputTokens === 'number' && {
        maxOutputTokens: planner.maxOutputTokens,
      }),
    });
    // Ein Aufruf eines Werkzeugs, das der Schritt nicht anbot, kommt als
    // `invalid` zurück (NoSuchToolError) und läuft nie — markiert statt gezählt.
    const pick =
      result.toolCalls
        .map((c) => ('invalid' in c && c.invalid ? `✗${c.toolName}` : c.toolName))
        .join('+') || '(keins)';
    return { pick, ms: Math.round(performance.now() - started) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { pick: `!${message.slice(0, 60)}`, ms: Math.round(performance.now() - started) };
  }
}

/** Wie oft der erste Aufruf, der wirklich läuft, zum Auftrag passt. */
function fitCount(picks: string[], fits: readonly string[]): number {
  return picks.filter((p) => {
    const first = p.split('+').find((name) => !name.startsWith('✗'));
    return first != null && fits.includes(first);
  }).length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function render(): string {
  const fitsOf = (id: string) => CASES.find((c) => c.id === id)?.fits ?? [];
  const count = (picks: string[], fits: readonly string[]) =>
    `${fitCount(picks, fits)}/${picks.length}`;
  const models = [...new Set(rows.map((r) => r.model))];
  const lines = [
    `# Erzwungener erster Schritt, live — ${REPS} Wiederholungen je Arm`,
    '',
    '| Modell | passt master | passt Zuschnitt | Fehler | p50 master | p50 Zuschnitt |',
    '|---|---|---|---|---|---|',
  ];
  for (const m of models) {
    const mine = rows.filter((r) => r.model === m);
    const sum = (pick: (r: Row) => string[]) =>
      mine.reduce((n, r) => n + fitCount(pick(r), fitsOf(r.id)), 0);
    const total = mine.reduce((n, r) => n + r.branch.length, 0);
    const errors = mine.reduce(
      (n, r) => n + [...r.master, ...r.branch].filter((p) => p.startsWith('!')).length,
      0
    );
    lines.push(
      `| ${m} | ${sum((r) => r.master)}/${total} | ${sum((r) => r.branch)}/${total} | ${errors} | ` +
        `${median(mine.flatMap((r) => r.masterMs))} ms | ${median(mine.flatMap((r) => r.branchMs))} ms |`
    );
  }
  for (const m of models) {
    lines.push(
      '',
      `## ${m}`,
      '',
      '| Fall | Zuschnitt | passt master | passt Zuschnitt | master | Zuschnitt |',
      '|---|---|---|---|---|---|'
    );
    for (const r of rows.filter((row) => row.model === m)) {
      lines.push(
        `| ${r.id} | ${r.narrowed ? r.narrowed.join(', ') : '—'} | ` +
          `${count(r.master, fitsOf(r.id))} | ${count(r.branch, fitsOf(r.id))} | ` +
          `${r.master.join(', ')} | ${r.branch.join(', ')} |`
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

describe('forced first planner step', () => {
  const pool = createProviderStub();
  let app: Awaited<ReturnType<typeof startChatApp>>;
  let atApp: Awaited<ReturnType<typeof startChatApp>>;
  let restoreNetwork: (() => void) | null = null;

  beforeAll(async () => {
    // Nur der Live-Lauf darf hinaus — und nur zum Planer.
    if (!LIVE) restoreNetwork = installNetworkGuard();
    app = await startChatApp();
    atApp = await startChatApp({ user: { locale: 'de-AT' } });
  }, 60_000);

  afterAll(async () => {
    if (LIVE) writeFileSync(OUT, render(), 'utf8');
    await app?.close();
    await atApp?.close();
    restoreNetwork?.();
  });

  beforeEach(() => {
    pinChatEnv(LIVE ? LIVE_KEYS : {});
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
      const baseUrl = c.locale === 'de-AT' ? atApp.baseUrl : app.baseUrl;
      if (c.before) {
        const before = c.before;
        const first = await runTurn(baseUrl, {
          messages: [userTurn(before.prompt)],
          ...c.body,
        });
        ctl.priorSteps = before.steps.map((tool, i) => priorStep(tool, i, before));
        ctl.captured.length = 0;
        await runTurn(baseUrl, {
          messages: [
            userTurn(c.before.prompt, 'm1'),
            { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Eine Antwort.' }] },
            userTurn(c.prompt, 'm2'),
          ],
          threadId: first.trace.threadId,
          ...c.body,
        });
      } else {
        await runTurn(baseUrl, { messages: [userTurn(c.prompt)], ...c.body });
      }

      const planner = ctl.captured[0];
      expect(planner, `${c.id}: der Zug erreichte den Loop nicht`).toBeDefined();
      if (!planner) return;

      const prepare = planner.prepareStep as PrepareStep;
      const step0 = prepare({ stepNumber: 0, steps: [] });
      // Ohne Schattenbetrieb hätte master schon einen Zuschnitt gehabt — dann
      // verglichen die zwei Arme nicht mehr master gegen diesen Stand.
      expect(prepare({ stepNumber: 1, steps: [] }).activeTools).toBeUndefined();

      expect(step0.toolChoice, `${c.id}: kein Zwang ohne benanntes Werkzeug`).toBe('required');
      const narrowed = step0.activeTools ?? [];
      expect(
        narrowed.length,
        `${c.id}: der erzwungene Schritt sieht den vollen Katalog`
      ).toBeGreaterThan(0);
      expect(
        c.fits.some((f) => narrowed.includes(f)),
        `${c.id}: kein passendes Werkzeug in [${narrowed.join(', ')}]`
      ).toBe(true);
      for (const decoy of c.without ?? DECOYS) {
        expect(narrowed, `${c.id}: ${decoy} im erzwungenen Schritt`).not.toContain(decoy);
      }

      if (!LIVE) return;
      const lane = planner.model as LanguageModel & { modelId?: string };
      expect(lane.modelId, `${c.id}: nicht die Produktions-Lane des Planers`).toBe(
        LOOP_PLANNER_PRIMARY.model
      );
      const models: Array<{ label: string; model: LanguageModel }> =
        MODEL_SPECS.length > 0
          ? MODEL_SPECS.map((spec) => {
              const cut = spec.indexOf('/');
              return {
                label: spec,
                model: getModel(spec.slice(0, cut), spec.slice(cut + 1)),
              };
            })
          : [{ label: `${LOOP_PLANNER_PRIMARY.provider}/${lane.modelId}`, model: lane }];

      // Die Modelle parallel, jedes mit seinen Wiederholungen nacheinander:
      // verschiedene Anbieter, und alle zur selben Tageszeit gemessen.
      await Promise.all(
        models.map(async ({ label, model }) => {
          const row: Row = {
            id: c.id,
            model: label,
            narrowed: step0.activeTools ?? null,
            mounted: Object.keys(planner.tools as object).length,
            master: [],
            branch: [],
            masterMs: [],
            branchMs: [],
          };
          rows.push(row);
          for (let i = 0; i < REPS; i++) {
            const master = await firstCall(planner, model, step0, null);
            row.master.push(master.pick);
            row.masterMs.push(master.ms);
            const branch = await firstCall(planner, model, step0, step0.activeTools ?? null);
            row.branch.push(branch.pick);
            row.branchMs.push(branch.ms);
          }
          // Zugesichert wird, was die Änderung behauptet — nie schlechter als
          // der volle Katalog —, nicht Fehlerfreiheit: das Modell streut auch
          // im Zuschnitt, und die Tabelle zeigt wie.
          expect
            .soft(
              fitCount(row.branch, c.fits),
              `${c.id} @ ${label}: Zuschnitt [${row.branch.join(', ')}] gegen master [${row.master.join(', ')}]`
            )
            .toBeGreaterThanOrEqual(fitCount(row.master, c.fits));
        })
      );
    },
    LIVE ? 600_000 : 15_000
  );
});
