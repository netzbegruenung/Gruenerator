/**
 * Was hier festgehalten wird, ist nicht die Formatierung der Ausgabe, sondern
 * die Bauform: dass die Nachschritte überhaupt stattfinden, dass die blinde
 * Rückübersetzung NUR die Fassung sieht, und dass ein Ausfall benannt statt
 * verschwiegen wird. Alle drei waren im Lauf vom 13.08.2026 verletzt — der eine
 * Turn bewertete sich selbst und meldete „vollständig", während ein Ortsname
 * fehlte.
 *
 * Seit 19.10.2026 rechnet der Code das Urteil aus einem Prüfbericht als Objekt
 * und führt die Überarbeitungsrunden selbst; getestet wird `checkAndRevise`, die
 * Prüfkette EINER Fassung. Die Tests fahren sie über die Registry, nicht über
 * fest verdrahtete Schritte: was hier grün ist, gilt für jeden Agenten, der
 * später dazukommt.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const executeProvider = vi.fn();
vi.mock('../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args) as unknown,
}));

const { _resetModelHealthForTests } = await import('../../../services/ai/modelHealth.js');
const { getPipelineAgent } = await import('../agents/pipelines/index.js');
const { resolveOriginalText, checkAndRevise, trimSectionFrame } =
  await import('./agentPipeline.js');

import type { ThreadAttachment } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PipelineAgent } from '../agents/pipelines/index.js';

const ES = getPipelineAgent('gruenerator-einfache-sprache') as PipelineAgent;
const LS = getPipelineAgent('gruenerator-leichte-sprache') as PipelineAgent;

const FASSUNG = 'Die Grünen fordern ein Sofortprogramm. '.repeat(15);
const ORIGINAL = 'Auf dem Parteitag in Sassnitz beschlossen die Grünen ein Sofortprogramm.';

interface Sent {
  event: string;
  payload: Record<string, unknown>;
}

/** Eine Antwort des Fake-Providers: Text, Ausfall (null) oder ein Werkzeugaufruf. */
type Answer = string | null | { tool: 'pruefbericht' | 'nachpruefung'; input: unknown };

/** Je Schritt-`type` eine Antwort — oder eine Liste, die pro Aufruf desselben Schritts vorrückt. */
type Script = Record<string, Answer | Answer[]>;

function toResult(answer: Answer) {
  if (answer !== null && typeof answer === 'object') {
    return {
      content: null,
      success: true,
      stop_reason: 'tool_use',
      tool_calls: [{ id: 't1', name: answer.tool, input: answer.input }],
    };
  }
  return { content: answer, success: true, stop_reason: 'stop' };
}

function fakePool(script: Script) {
  const calls: Array<{
    type: string;
    systemPrompt: string;
    userMessage: string;
    provider: string;
  }> = [];
  const counts: Record<string, number> = {};
  executeProvider.mockReset();
  executeProvider.mockImplementation(
    async (provider: string, _id: string, req: Record<string, unknown>) => {
      const type = String(req.type);
      const messages = req.messages as Array<{ content: string }>;
      calls.push({
        type,
        systemPrompt: String(req.systemPrompt),
        userMessage: messages[0]?.content ?? '',
        provider,
      });
      const entry = script[type] ?? null;
      const n = (counts[type] = (counts[type] ?? 0) + 1);
      const answer = Array.isArray(entry) ? (entry[Math.min(n, entry.length) - 1] ?? null) : entry;
      return toResult(answer);
    }
  );
  return { calls };
}

function fakeSse(): {
  sse: { send: (e: string, p: unknown) => void; isEnded: () => boolean };
  sent: Sent[];
} {
  const sent: Sent[] = [];
  return {
    sent,
    sse: {
      send: (event: string, payload: unknown) => {
        sent.push({ event, payload: payload as Record<string, unknown> });
      },
      isEnded: () => false,
    },
  };
}

const RUECK_TYPE = 'chat_einfache_sprache_rueck';
const PRUEF_TYPE = 'chat_einfache_sprache_pruefung';
const UEBER_TYPE = 'chat_einfache_sprache_ueberarbeitung';
const NACH_TYPE = 'chat_einfache_sprache_nachpruefung';

/** Ein Prüfbericht, der alles für vollständig hält. */
const freigabe: Answer = {
  tool: 'pruefbericht',
  input: {
    abdeckung: [{ punkt: 'Sofortprogramm beschlossen', status: 'vollständig' }],
    modalitaet: [{ original: 'beschlossen', fassung: 'fordern', erhalten: true }],
    befunde: [{ stelle: 'Satz 1', fehlerart: 'r', schweregrad: 'NIEDRIG', beschreibung: 'Stil' }],
  },
};

/** Ein Bericht mit einem HOCH-Befund: die Überarbeitung muss laufen. */
const mitHoch: Answer = {
  tool: 'pruefbericht',
  input: {
    abdeckung: [{ punkt: 'Sofortprogramm beschlossen', status: 'vollständig' }],
    modalitaet: [],
    befunde: [
      {
        stelle: 'Satz 1',
        fehlerart: 'a',
        schweregrad: 'HOCH',
        beschreibung: 'Ortsname fehlt',
        beleg: 'in Sassnitz',
      },
    ],
  },
};

const behoben = (...nr: number[]): Answer => ({
  tool: 'nachpruefung',
  input: { punkte: nr.map((n) => ({ nr: n, behoben: true, beleg: 'steht da' })), neue_befunde: [] },
});
const nichtBehoben = (...nr: number[]): Answer => ({
  tool: 'nachpruefung',
  input: { punkte: nr.map((n) => ({ nr: n, behoben: false })), neue_befunde: [] },
});

function run(
  script: Script,
  overrides: { original?: string; fassung?: string; pipeline?: PipelineAgent } = {}
) {
  const { sse, sent } = fakeSse();
  const { calls } = fakePool(script);
  const promise = checkAndRevise({
    pipeline: overrides.pipeline ?? ES,
    sse: sse as never,
    original: overrides.original ?? ORIGINAL,
    fassung: overrides.fassung ?? FASSUNG,
  });
  return { promise, sent, calls };
}

describe('checkAndRevise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Der Vermerk aus services/ai/modelHealth.ts überdauert sonst den Test:
    // ein Lauf, in dem die Hedge-Frist riss, schickt den nächsten sofort zum
    // Sibling — richtig im Betrieb, hier eine Verunreinigung.
    _resetModelHealthForTests();
  });

  it('reicht der Rückübersetzung NUR die Fassung, nie das Original', async () => {
    const { promise, calls } = run({
      [RUECK_TYPE]: 'Fachdeutsche Fassung.',
      [PRUEF_TYPE]: freigabe,
    });
    await promise;

    const rueck = calls.find((c) => c.type === RUECK_TYPE);
    // Der eigentliche Befund: die Nachricht IST die Fassung, und das Original
    // taucht in diesem Aufruf nirgends auf — auch nicht im Systemprompt. Wäre
    // es dabei, wäre die „blinde" Rückübersetzung eine Rekonstruktion und als
    // Prüfmittel wertlos.
    expect(rueck?.userMessage).toBe(FASSUNG.trim());
    expect(JSON.stringify(rueck)).not.toContain('Sassnitz');
  });

  it('gibt der Prüfung Original, Fassung und Rückübersetzung', async () => {
    const { promise, calls } = run({
      [RUECK_TYPE]: 'Fachdeutsche Fassung.',
      [PRUEF_TYPE]: freigabe,
    });
    await promise;

    const pruef = calls.find((c) => c.type === PRUEF_TYPE);
    expect(pruef?.userMessage).toContain(ORIGINAL);
    expect(pruef?.userMessage).toContain(FASSUNG);
    expect(pruef?.userMessage).toContain('Fachdeutsche Fassung.');
  });

  it('prüft trotzdem, wenn die Rückübersetzung ausfällt, und benennt den Ausfall', async () => {
    const { promise, calls } = run({ [RUECK_TYPE]: null, [PRUEF_TYPE]: freigabe });
    const out = await promise;

    const pruef = calls.find((c) => c.type === PRUEF_TYPE);
    expect(pruef?.userMessage).toContain('nicht zustande gekommen');
    expect(out.endstand).toBe('FREIGABE');
    expect(out.protokoll).toContain('Rückübersetzung ist nicht zustande gekommen');
  });

  it('gibt bei FREIGABE die Fassung unverändert zurück, ohne Überarbeitung', async () => {
    const { promise, calls } = run({ [RUECK_TYPE]: 'Fachdeutsch.', [PRUEF_TYPE]: freigabe });
    const out = await promise;

    expect(out).toMatchObject({ final: FASSUNG, endstand: 'FREIGABE', runden: 0, offen: 0 });
    expect(calls.map((c) => c.type)).toEqual([RUECK_TYPE, PRUEF_TYPE]);
  });

  it('überarbeitet bei einem HOCH-Befund und gibt nach der Nachprüfung frei', async () => {
    const { promise, calls } = run({
      [RUECK_TYPE]: 'Fachdeutsch.',
      [PRUEF_TYPE]: mitHoch,
      [UEBER_TYPE]: 'Überarbeitete Fassung mit Sassnitz.',
      [NACH_TYPE]: behoben(1),
    });
    const out = await promise;

    // Die Überarbeitung sieht Original, Fassung und die NUMMERIERTE Liste.
    const ueber = calls.find((c) => c.type === UEBER_TYPE);
    expect(ueber?.userMessage).toContain(ORIGINAL);
    expect(ueber?.userMessage).toContain(FASSUNG);
    expect(ueber?.userMessage).toContain('1. [HOCH]');
    expect(ueber?.userMessage).toContain('Ortsname fehlt');

    expect(out).toMatchObject({
      final: 'Überarbeitete Fassung mit Sassnitz.',
      endstand: 'FREIGABE',
      runden: 1,
      offen: 0,
    });
    expect(out.protokoll).toContain('### Überarbeitung, Runde 1');
    expect(out.protokoll).toContain('### Nachprüfung, Runde 1');
  });

  it('bricht nach MAX_ROUNDS (2) ab, wenn ein HOCH-Punkt offen bleibt', async () => {
    const { promise, calls } = run({
      [RUECK_TYPE]: 'Fachdeutsch.',
      [PRUEF_TYPE]: mitHoch,
      [UEBER_TYPE]: ['Zweite Fassung.', 'Dritte Fassung.'],
      [NACH_TYPE]: [nichtBehoben(1), nichtBehoben(1)],
    });
    const out = await promise;

    expect(calls.filter((c) => c.type === UEBER_TYPE)).toHaveLength(2);
    expect(calls.filter((c) => c.type === NACH_TYPE)).toHaveLength(2);
    // Die zweite Runde überarbeitet die Fassung der ersten, nicht die Urfassung.
    const zweite = calls.filter((c) => c.type === UEBER_TYPE)[1];
    expect(zweite?.userMessage).toContain('Zweite Fassung.');
    expect(out).toMatchObject({
      final: 'Dritte Fassung.',
      endstand: 'ÜBERARBEITUNG',
      runden: 2,
      offen: 1,
    });
  });

  it('zählt einen Punkt, den die Nachprüfung nicht erwähnt, als offen', async () => {
    const { promise } = run({
      [RUECK_TYPE]: 'Fachdeutsch.',
      [PRUEF_TYPE]: mitHoch,
      [UEBER_TYPE]: 'Neue Fassung.',
      // Schweigen ist kein Befund: weder behoben noch ein Eintrag zu Punkt 1.
      [NACH_TYPE]: { tool: 'nachpruefung', input: { punkte: [], neue_befunde: [] } },
    });
    const out = await promise;

    expect(out.endstand).toBe('ÜBERARBEITUNG');
    expect(out.runden).toBe(2);
    expect(out.protokoll).toContain('nicht geprüft → offen');
  });

  it('meldet UNGEPRÜFT mit der Fassung, wenn die Prüfung ausfällt', async () => {
    const { promise, calls } = run({ [RUECK_TYPE]: 'Fachdeutsch.', [PRUEF_TYPE]: null });
    const out = await promise;

    // Ohne diesen Endstand sähe eine ungeprüfte Fassung wie eine freigegebene aus.
    expect(out).toMatchObject({ final: FASSUNG, endstand: 'UNGEPRÜFT', runden: 0 });
    expect(calls.some((c) => c.type === UEBER_TYPE)).toBe(false);
    expect(out.protokoll).toContain('Die Prüfung ist nicht zustande gekommen');
  });

  it('meldet UNGEPRÜFT, wenn der Bericht auf allen Versuchen ungültig ist', async () => {
    // Eine leere Abdeckung ist kein Bericht: das Zählwerk fehlt.
    const { promise } = run({
      [RUECK_TYPE]: 'Fachdeutsch.',
      [PRUEF_TYPE]: {
        tool: 'pruefbericht',
        input: { abdeckung: [], modalitaet: [], befunde: [] },
      },
    });
    const out = await promise;

    expect(out).toMatchObject({ final: FASSUNG, endstand: 'UNGEPRÜFT' });
  });

  it('meldet UNGEPRÜFT mit der neuen Fassung, wenn die Nachprüfung ausfällt', async () => {
    const { promise } = run({
      [RUECK_TYPE]: 'Fachdeutsch.',
      [PRUEF_TYPE]: mitHoch,
      [UEBER_TYPE]: 'Neue Fassung.',
      [NACH_TYPE]: null,
    });
    const out = await promise;

    // Die neue Fassung geht raus — sie arbeitet die Befunde ab —, aber ungeprüft.
    expect(out).toMatchObject({ final: 'Neue Fassung.', endstand: 'UNGEPRÜFT', runden: 1 });
    expect(out.protokoll).toContain('Die Nachprüfung ist nicht zustande gekommen');
  });

  it('behält die Fassung und den Befund, wenn die Überarbeitung ausfällt', async () => {
    const { promise } = run({
      [RUECK_TYPE]: 'Fachdeutsch.',
      [PRUEF_TYPE]: mitHoch,
      [UEBER_TYPE]: null,
    });
    const out = await promise;

    expect(out).toMatchObject({ final: FASSUNG, endstand: 'ÜBERARBEITUNG', runden: 1, offen: 1 });
    expect(out.protokoll).toContain('Die Überarbeitung ist nicht zustande gekommen');
  });

  it('kürzt ein überlanges Original und sagt es dem Prüfer', async () => {
    // Drei Texte plus Systemprompt müssen in ein Fenster passen. Still gekürzt
    // wäre die Abdeckungsliste unvollständig, ohne dass es jemand merkt — und
    // genau sie ist das Prüfmittel.
    const riesig = 'Ein Satz über Klimaanlagen in Pflegeheimen. '.repeat(1000);
    expect(riesig.length).toBeGreaterThan(24000);

    const { promise, calls } = run(
      { [RUECK_TYPE]: 'Fachdeutsch.', [PRUEF_TYPE]: freigabe },
      { original: riesig }
    );
    await promise;

    const pruef = calls.find((c) => c.type === PRUEF_TYPE);
    expect(pruef?.userMessage.length).toBeLessThan(riesig.length);
    expect(pruef?.userMessage).toContain('Gekürzt');
  });

  it('hängt den Abschnitts-Suffix an die Schritt-IDs', async () => {
    const { sse, sent } = fakeSse();
    fakePool({ [RUECK_TYPE]: 'Fachdeutsch.', [PRUEF_TYPE]: freigabe });
    await checkAndRevise({
      pipeline: ES,
      sse: sse as never,
      original: ORIGINAL,
      fassung: FASSUNG,
      suffix: '-2',
      label: ' (Abschnitt 2 von 3)',
    });

    const ids = new Set(sent.map((s) => s.payload.stepId));
    expect(ids).toEqual(new Set(['es-rueck-2', 'es-pruefung-2']));
    expect(sent.some((s) => String(s.payload.title).endsWith('(Abschnitt 2 von 3)'))).toBe(true);
  });

  it('meldet den laufenden Schritt weiter, solange er läuft', async () => {
    // Der Prüfbericht brauchte am 14.08.2026 218 Sekunden. In dieser Zeit ging
    // genau EIN Ereignis raus — auf dem Bildschirm nicht von einem Absturz zu
    // unterscheiden, und die Leitung liegt derweil ohne ein einziges Byte da.
    vi.useFakeTimers();
    try {
      const { sse, sent } = fakeSse();
      // Nur der ERSTE Schritt hängt; der zweite antwortet sofort, damit die
      // Kette nach dem Freigeben zu Ende läuft.
      const holder: { release?: () => void } = {};
      executeProvider.mockReset();
      executeProvider.mockImplementation(
        async (_p: string, _id: string, req: Record<string, unknown>) => {
          if (String(req.type) !== RUECK_TYPE) return toResult(freigabe);
          await new Promise<void>((resolve) => {
            holder.release = resolve;
          });
          return toResult('Fachdeutsch.');
        }
      );
      const promise = checkAndRevise({
        pipeline: ES,
        sse: sse as never,
        original: ORIGINAL,
        fassung: FASSUNG,
      });
      await vi.advanceTimersByTimeAsync(10_000);

      const beats = sent.filter(
        (s) => s.event === 'progress_step' && s.payload.status === 'in_progress'
      );
      expect(beats.length).toBeGreaterThan(2);
      // Wiederholt wird der Schritt selbst, nicht ein Platzhalter.
      expect(new Set(beats.map((s) => s.payload.stepId))).toEqual(new Set(['es-rueck']));

      holder.release?.();
      await promise;
      // Der Schlag hört auf, wenn der Schritt fertig ist — sonst liefe er über
      // die nächste Antwort hinweg weiter.
      const nachher = sent.filter((s) => s.payload.stepId === 'es-rueck').length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(sent.filter((s) => s.payload.stepId === 'es-rueck')).toHaveLength(nachher);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Der Hedge, und was an ihm schiefgehen kann: dass er im Normalfall trotzdem
 * feuert (doppelte Kosten), dass er im Störfall NICHT feuert (der Fehler vom
 * 14.08.), und dass er auf einen abgelaufenen Wecker wartet, obwohl der Primär
 * längst gescheitert ist.
 */
describe('checkAndRevise — Sibling bei Langsamkeit', () => {
  // Ein Lauf, in dem die Frist riss, vermerkt das Paar — der nächste Lauf ginge
  // sonst sofort zum Sibling. Im Betrieb genau richtig, hier eine
  // Verunreinigung zwischen den Fällen.
  beforeEach(() => {
    _resetModelHealthForTests();
  });

  /** Ein Pool, dessen Antwort je Provider verschieden ausfällt. */
  function poolNachProvider(handler: (provider: string, type: string) => Promise<Answer>): {
    calls: Array<{ provider: string; type: string }>;
  } {
    const calls: Array<{ provider: string; type: string }> = [];
    executeProvider.mockReset();
    executeProvider.mockImplementation(
      async (provider: string, _id: string, req: Record<string, unknown>) => {
        const type = String(req.type);
        calls.push({ provider, type });
        return toResult(await handler(provider, type));
      }
    );
    return { calls };
  }

  /** Antwort, die zum Schritt passt: die Prüfung bekommt ihr Objekt. */
  const antwort = (type: string, text: string): Answer => (type === PRUEF_TYPE ? freigabe : text);

  const laufe = () =>
    checkAndRevise({
      pipeline: ES,
      sse: fakeSse().sse as never,
      original: ORIGINAL,
      fassung: FASSUNG,
    });

  it('ruft den Sibling NICHT, wenn der Primär rechtzeitig antwortet', async () => {
    // Der teuerste Fehlgriff wäre ein Hedge, der immer feuert: jeder Schritt
    // kostete dann zwei Aufrufe, in Tokens wie in CO₂.
    const { calls } = poolNachProvider(async (_p, type) => antwort(type, 'Fertig.'));
    await laufe();

    expect(calls.map((c) => c.provider)).toEqual(['cortecs', 'cortecs']);
  });

  it('lässt den Sibling gewinnen, wenn der Primär über die Frist hinaus schweigt', async () => {
    vi.useFakeTimers();
    try {
      const { calls } = poolNachProvider(async (provider, type) => {
        // Der Primär antwortet nie — der langsame Lauf vom 14.08. im Extrem.
        if (provider === 'cortecs') return new Promise<Answer>(() => {});
        return antwort(type, 'Vom Sibling.');
      });
      const promise = laufe();

      // Vor der Frist (30 s für die Rückübersetzung) darf nichts passieren.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(calls.map((c) => c.provider)).toEqual(['cortecs']);

      // Reichlich: die Prüfung hat ihre eigene, längere Frist.
      await vi.advanceTimersByTimeAsync(300_000);
      const out = await promise;

      expect(calls.filter((c) => c.provider === 'melious')).not.toHaveLength(0);
      expect(out.protokoll).toContain('Vom Sibling.');
      // Und nicht als Ausfall verbucht: beide Schritte haben geliefert.
      expect(out.endstand).toBe('FREIGABE');
      expect(out.protokoll).not.toContain('nicht zustande gekommen');
    } finally {
      vi.useRealTimers();
    }
  });

  it('der ZWEITE Lauf wartet die Frist nicht noch einmal ab', async () => {
    // Das eigentliche Versprechen: eine Störung wird einmal entdeckt. Ohne
    // Vermerk zahlte jeder Turn die 30 s erneut, obwohl der Turn davor sie
    // schon bewiesen hat.
    vi.useFakeTimers();
    try {
      poolNachProvider(async (provider, type) =>
        provider === 'cortecs' ? new Promise<Answer>(() => {}) : antwort(type, 'Vom Sibling.')
      );
      const ersterLauf = laufe();
      await vi.advanceTimersByTimeAsync(300_000);
      await ersterLauf;

      const zweiter = poolNachProvider(async (_p, type) => antwort(type, 'Vom Sibling.'));
      await laufe();

      // Kein Tick auf der Uhr, und der Primär wurde gar nicht erst gefragt.
      expect(zweiter.calls.map((c) => c.provider)).toEqual(['melious', 'melious']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holt den Sibling sofort, wenn der Primär vorher scheitert', async () => {
    // Auf den Wecker zu warten, obwohl schon feststeht, dass nichts mehr kommt,
    // wäre eine halbe Minute geschenkt.
    vi.useFakeTimers();
    try {
      // NUR der Sibling antwortet: der Primär fällt aus, und mit ihm die
      // generische Ausfallkette hinter ihm. Sonst finge die Kette den Schritt
      // ab, bevor der Hedge überhaupt drankäme — was sie in Produktion auch
      // tut, hier aber den Prüfgegenstand verdeckt.
      //
      // Unterschieden wird über die REIHENFOLGE und nicht über den
      // Providernamen: seit dem 14.09.2026 ist `melious` beides — Ausweich
      // dieser Stufe UND zweiter Eintrag der generischen Kette. Der Mock sieht
      // das Modell nicht (`req.model` ist auf diesem Pfad leer), das es sonst
      // auseinanderhielte.
      //
      // Genau darin liegt übrigens der verbliebene Wert des Hedges: die Kette
      // fragt Melious mit dessen Standardmodell, der Hedge mit
      // `gemma-4-31b:balanced`, dem Modell, für das diese Stufe ausgewählt
      // wurde.
      const PRIMAER_UND_KETTE = 3; // cortecs → melious → mistral
      let rueckAufrufe = 0;
      const { calls } = poolNachProvider(async (_provider, type) => {
        if (type !== RUECK_TYPE) return null;
        rueckAufrufe += 1;
        return rueckAufrufe > PRIMAER_UND_KETTE ? 'Vom Sibling.' : null;
      });
      const promise = laufe();
      // Ohne einen einzigen Tick auf der Uhr: der Sibling folgt dem gescheiterten
      // Primär sofort, ohne die Frist abzuwarten.
      await vi.advanceTimersByTimeAsync(0);

      // Je Schritt Primär, dessen Ausfallkette — und dann sofort der Sibling.
      const rueck = calls.filter((c) => c.type === RUECK_TYPE);
      expect(rueck.map((c) => c.provider)).toEqual([
        'cortecs',
        'melious',
        'mistral',
        // Der Hedge: derselbe Prüfer beim anderen Vertragspartner.
        'melious',
      ]);
      expect((await promise).protokoll).toContain('Vom Sibling.');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveOriginalText', () => {
  const leer = {
    attachmentContext: null,
    documentMentionContext: null,
    currentDocument: null,
    threadAttachments: [],
  };
  const lang = 'Auf dem Parteitag in Sassnitz. '.repeat(20);
  const anhang = (
    extractedText: string,
    over: Partial<ThreadAttachment> = {}
  ): ThreadAttachment => ({
    id: 'a1',
    name: 'Eingefügter Text.txt',
    mimeType: 'text/plain',
    isImage: false,
    extractedText,
    documentId: null,
    summary: null,
    hasFileData: false,
    createdAt: new Date('2026-08-13T21:38:00Z'),
    ...over,
  });

  it('nimmt den eingefügten Text aus der Nachricht', () => {
    expect(resolveOriginalText(leer, lang)).toBe(lang.trim());
  });

  it('nimmt den Anhang, wenn die Nachricht nur die Anweisung trägt', () => {
    const state = { ...leer, attachmentContext: lang };
    expect(resolveOriginalText(state, 'Übertrage das in Einfache Sprache')).toBe(lang.trim());
  });

  it('nimmt die @dokument-Mention — der Fall, der vorher durchfiel', () => {
    // Die Nutzernachricht ist hier NICHT leer, sondern kurz. Eine `||`-Kette
    // hätte sie genommen und gegen einen Einzeiler geprüft.
    const state = { ...leer, documentMentionContext: lang };
    expect(resolveOriginalText(state, 'Übertrage @mein-antrag in Einfache Sprache')).toBe(
      lang.trim()
    );
  });

  it('greift auf das offene Dokument nur zurück, wenn es sonst nichts gibt', () => {
    const cur = { id: 'd1', title: null, markdown: lang, selectionText: null };
    expect(resolveOriginalText({ ...leer, currentDocument: cur }, '  ')).toBe(lang.trim());
    // Mit eingefügtem Material gewinnt das Material, auch wenn das offene
    // Dokument länger ist — es hat mit der Anfrage nichts zu tun.
    const kurz = 'Kurzer eingefügter Absatz.';
    expect(resolveOriginalText({ ...leer, currentDocument: cur }, kurz)).toBe(kurz);
  });

  it('gibt einen leeren String, wenn es nichts gibt', () => {
    expect(resolveOriginalText(leer, '   ')).toBe('');
  });

  it('nimmt in einem Revisions-Turn nicht die Kritik des Nutzers als Original', () => {
    // Der Lauf vom 13.08.2026: der Artikel lag im Anhang des ersten Turns, die
    // Beanstandung im zweiten. Die Beanstandung gewann den Längenvergleich, weil
    // sie der einzige Kandidat war — der Prüfbericht führte danach die Kritik als
    // „Kerninhalte des Originals" und lehnte die Fassung ab.
    const kritik = 'Die Freigabe ist falsch: nicht veröffentlichungsreif. '.repeat(20);
    const state = { ...leer, threadAttachments: [anhang(lang)] };
    expect(kritik.length).toBeGreaterThan(lang.length);
    expect(resolveOriginalText(state, kritik)).toBe(lang.trim());
  });

  it('lässt neu eingefügtes Material den mitgeführten Text ablösen', () => {
    // Anders als eine Anweisung ist Material lang — dieselbe Grenze, an der
    // `inlineMaterialAttachment` es zum Anhang macht.
    const neu = 'Ein zweiter Artikel, frisch eingefügt. '.repeat(120);
    const state = { ...leer, threadAttachments: [anhang(lang)] };
    expect(neu.length).toBeGreaterThanOrEqual(3000);
    expect(resolveOriginalText(state, neu)).toBe(neu.trim());
  });

  it('lässt kurzes EINGEFÜGTES Material den mitgeführten Text ablösen', () => {
    // Der Lauf vom 14.08.2026: ein frisch eingefügter Text von 1339 Zeichen fiel
    // unter die Längengrenze, galt als Anweisung und wurde vom Artikel des
    // vorigen Turns verdrängt. Die Fassung entstand trotzdem aus ihm, die
    // Prüfung mass gegen den alten Artikel und meldete sie als Halluzination.
    const neu = 'Der Stadtrat hat über einen neuen Busfahrplan beraten. '.repeat(8);
    const state = { ...leer, threadAttachments: [anhang(lang)] };
    expect(neu.length).toBeLessThan(3000);
    expect(resolveOriginalText(state, neu, true)).toBe(neu.trim());
    // Ohne das Merkmal entscheidet weiter die Länge — eine getippte Beanstandung
    // derselben Länge bleibt eine Anweisung.
    expect(resolveOriginalText(state, neu)).toBe(lang.trim());
  });

  it('lässt einen Anhang DIESES Turns den mitgeführten Text ablösen', () => {
    const neu = 'Ein zweiter Artikel, diesmal als Datei. '.repeat(5);
    const state = { ...leer, attachmentContext: neu, threadAttachments: [anhang(lang)] };
    expect(resolveOriginalText(state, 'Übertrage das')).toBe(neu.trim());
  });

  it('führt den jüngsten Anhang mit, nicht den längsten — in beiden Listenrichtungen', () => {
    // Über mehrere Turns ist „welches Dokument" eine Frage der Reihenfolge:
    // wer einen zweiten Text nachreicht, meint ihn. Entschieden wird das am
    // Zeitstempel, nicht an der Listenposition: `getThreadAttachments` fragt DESC
    // ab und dreht danach um, und seine Doku behauptete jahrelang das Gegenteil —
    // eine Auswahl, deren Fehlgriff ein falsches Original ist, darf daran nicht
    // hängen.
    const neuer = 'Der zweite Artikel. '.repeat(5);
    const alt = anhang(lang, { createdAt: new Date('2026-08-13T21:38:00Z') });
    const jung = anhang(neuer, { id: 'a2', createdAt: new Date('2026-08-13T21:41:00Z') });

    for (const liste of [
      [alt, jung],
      [jung, alt],
    ]) {
      const state = { ...leer, threadAttachments: liste };
      expect(resolveOriginalText(state, 'Und jetzt der hier bitte')).toBe(neuer.trim());
    }
  });

  it('nimmt bei gleichem Zeitstempel den letzten der Liste', () => {
    // Zwei Anhänge desselben Turns: die Sortierung ist stabil, also entscheidet
    // die Listenreihenfolge — kein Zufall, sondern der einzige verbliebene Hinweis.
    const zweiter = 'Die zweite Datei desselben Turns. '.repeat(5);
    const state = {
      ...leer,
      threadAttachments: [anhang(lang), anhang(zweiter, { id: 'a2' })],
    };
    expect(resolveOriginalText(state, 'Bitte übertragen')).toBe(zweiter.trim());
  });

  it('führt kein Bild mit — seine Beschreibung ist kein Ausgangstext', () => {
    const bild = anhang('Ein Foto zeigt Klimageräte auf einem Dach.', {
      isImage: true,
      mimeType: 'image/png',
    });
    expect(resolveOriginalText({ ...leer, threadAttachments: [bild] }, 'Nochmal bitte')).toBe(
      'Nochmal bitte'
    );
  });

  describe('Seitenmarken aus PDF-Anhängen', () => {
    const seite1 = 'Auf dem Parteitag in Sassnitz. '.repeat(10).trim();
    const seite2 = 'Beschluss zur Mobilitätswende. '.repeat(10).trim();
    const markiert = `## Seite 1\n\n${seite1}\n\n## Seite 2\n\n${seite2}`;
    const ohne = `${seite1}\n\n${seite2}`;

    it('nimmt sie aus dem Anhang dieses Turns heraus', () => {
      const state = {
        ...leer,
        attachmentContext: `### antrag.pdf (Volltext-Auszug)\n\n${markiert}`,
      };
      const result = resolveOriginalText(state, 'Überarbeite das');
      expect(result).not.toMatch(/## Seite \d/);
      expect(result).toBe(`### antrag.pdf (Volltext-Auszug)\n\n${ohne}`);
    });

    it('nimmt sie aus dem mitgeführten Thread-Anhang heraus', () => {
      const pdf = anhang(markiert, { name: 'antrag.pdf', mimeType: 'application/pdf' });
      expect(resolveOriginalText({ ...leer, threadAttachments: [pdf] }, 'Nochmal kürzer')).toBe(
        ohne
      );
    });
  });
});

describe('Pipeline-Registry', () => {
  it('erkennt die eingetragenen Agenten und sonst keinen', () => {
    expect(getPipelineAgent('gruenerator-einfache-sprache')).not.toBeNull();
    expect(getPipelineAgent('gruenerator-leichte-sprache')).not.toBeNull();
    expect(getPipelineAgent('gruenerator-universal')).toBeNull();
    expect(getPipelineAgent(null)).toBeNull();
    expect(getPipelineAgent(undefined)).toBeNull();
  });

  it('bringt für beide Agenten die Persona im Repo mit', () => {
    // Seit 19.10.2026 auch Leichte Sprache: das Regelwerk ist Handwerk (Satzbau,
    // Trennpunkte, Zahlenregeln), kein Korpuswissen — siehe types.ts.
    expect(ES.systemRole).toContain('B1');
    expect(LS.systemRole).toContain('Leichte Sprache');
  });

  it('gibt jedem Schritt beider Pipelines Id, Titel, Prompt, Typ und Budget', () => {
    for (const pipeline of [ES, LS]) {
      for (const step of Object.values(pipeline.steps)) {
        expect(step.id.length).toBeGreaterThan(0);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.systemPrompt.length).toBeGreaterThan(100);
        expect(step.requestType).toMatch(/^chat_einfache_sprache_/);
        expect(step.maxTokens).toBeGreaterThan(0);
      }
    }
  });

  it('führt die Eigenmittel von Leichter Sprache in Prüfung und Nachprüfung', () => {
    // Sonst meldet die Prüfung die Trennpunkte als Hinzufügung und die
    // Überarbeitung nimmt sie wieder heraus.
    expect(LS.steps.pruefung.systemPrompt).toContain('Trennpunkte');
    expect(LS.steps.nachpruefung.systemPrompt).toContain('Trennpunkte');
  });
});

describe('trimSectionFrame', () => {
  const ABSCHNITT =
    '# Titel\n\n## Worum geht es?\nEs geht um Rad·wege.\n\n## Der Plan\nDas Netz ist lang.\n\n' +
    'Das ist ein Text in Leichter Sprache.\nDer Original-Text ist ein Beitrag.';

  it('lässt einen einzigen Abschnitt unangetastet', () => {
    expect(trimSectionFrame(ABSCHNITT, 0, 1)).toBe(ABSCHNITT);
  });

  it('nimmt einem mittleren Abschnitt Titel, Einordnung und Schlusshinweis', () => {
    // Live am 19.10.2026: die Überarbeitung setzte mittleren Abschnitten eines
    // 96k-Textes wieder Titel und Hinweis auf — zusammengesetzt standen sie
    // mitten im Text.
    expect(trimSectionFrame(ABSCHNITT, 1, 3)).toBe('## Der Plan\nDas Netz ist lang.');
  });

  it('behält Titel im ersten und den Hinweis im letzten Abschnitt', () => {
    expect(trimSectionFrame(ABSCHNITT, 0, 3)).toMatch(/^# Titel/);
    expect(trimSectionFrame(ABSCHNITT, 0, 3)).not.toContain('Original-Text');
    expect(trimSectionFrame(ABSCHNITT, 2, 3)).toContain('Der Original-Text ist ein Beitrag.');
    expect(trimSectionFrame(ABSCHNITT, 2, 3)).not.toContain('# Titel');
  });
});
