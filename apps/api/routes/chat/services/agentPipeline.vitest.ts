/**
 * Was hier festgehalten wird, ist nicht die Formatierung der Ausgabe, sondern
 * die Bauform: dass die Nachschritte überhaupt stattfinden, dass die blinde
 * Rückübersetzung NUR die Fassung sieht, und dass ein Ausfall benannt statt
 * verschwiegen wird. Alle drei waren im Lauf vom 13.08.2026 verletzt — der eine
 * Turn bewertete sich selbst und meldete „vollständig", während ein Ortsname
 * fehlte.
 *
 * Die Tests fahren die Kette über die Registry, nicht über fest verdrahtete
 * Schritte: was hier grün ist, gilt für jeden Agenten, der später dazukommt.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const executeProvider = vi.fn();
vi.mock('../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { _resetModelHealthForTests } = await import('../../../services/ai/modelHealth.js');
const { getPipelineAgent } = await import('../agents/pipelines/index.js');
const { resolveOriginalText, runAgentPipeline } = await import('./agentPipeline.js');

import type { ThreadAttachment } from '../../../agents/langgraph/ChatGraph/types.js';
import type { PipelineAgent } from '../agents/pipelines/index.js';

const ES = getPipelineAgent('gruenerator-einfache-sprache') as PipelineAgent;

/** Über der Schwelle, damit die Kette überhaupt anläuft. */
const FASSUNG = 'Die Grünen fordern ein Sofortprogramm. '.repeat(15);
const ORIGINAL = 'Auf dem Parteitag in Sassnitz beschlossen die Grünen ein Sofortprogramm.';

interface Sent {
  event: string;
  payload: Record<string, unknown>;
}

/** Nimmt je Schritt-`type` eine Antwort entgegen; null = Ausfall. */
function fakePool(answers: Record<string, string | null>) {
  const calls: Array<{
    type: string;
    systemPrompt: string;
    userMessage: string;
    provider: string;
    model: string;
  }> = [];
  executeProvider.mockReset();
  executeProvider.mockImplementation(
    async (provider: string, _id: string, req: Record<string, unknown>) => {
      const messages = req.messages as Array<{ content: string }>;
      calls.push({
        type: String(req.type),
        systemPrompt: String(req.systemPrompt),
        userMessage: messages[0]?.content ?? '',
        provider,
        model: String((req.options as { model?: string } | undefined)?.model),
      });
      return { content: answers[String(req.type)] ?? null, success: true, stop_reason: 'stop' };
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

function run(
  answers: Record<string, string | null>,
  overrides: { produced?: string; original?: string } = {}
) {
  const { sse, sent } = fakeSse();
  const { calls } = fakePool(answers);
  const promise = runAgentPipeline({
    pipeline: ES,
    state: {} as never,
    sse: sse as never,
    produced: overrides.produced ?? FASSUNG,
    original: overrides.original ?? ORIGINAL,
  });
  return { promise, sent, calls };
}

const streamed = (sent: Sent[]): string =>
  sent
    .filter((s) => s.event === 'text_delta')
    .map((s) => String(s.payload.text))
    .join('');

describe('runAgentPipeline', () => {
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
      [PRUEF_TYPE]: 'FREIGABE',
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

  it('gibt der Prüfung alle drei Texte', async () => {
    const { promise, calls } = run({
      [RUECK_TYPE]: 'Fachdeutsche Fassung.',
      [PRUEF_TYPE]: 'ÜBERARBEITUNG',
    });
    await promise;

    const pruef = calls.find((c) => c.type === PRUEF_TYPE);
    expect(pruef?.userMessage).toContain(ORIGINAL);
    expect(pruef?.userMessage).toContain(FASSUNG);
    expect(pruef?.userMessage).toContain('Fachdeutsche Fassung.');
  });

  it('strömt jeden Schritt und gibt exakt das Angehängte zurück', async () => {
    const { promise, sent } = run({
      [RUECK_TYPE]: 'Fachdeutsche Fassung.',
      [PRUEF_TYPE]: 'FREIGABE, keine Befunde.',
    });
    const appended = await promise;

    expect(appended).toContain('Fachdeutsche Fassung.');
    expect(appended).toContain('FREIGABE, keine Befunde.');
    // Rückgabewert und Bildschirm müssen deckungsgleich sein — sonst zeigt ein
    // Neuladen des Threads etwas anderes als der Lauf.
    expect(streamed(sent)).toBe(appended);
  });

  it('benennt einen ausgefallenen Schritt, statt ihn zu verschweigen', async () => {
    const { promise } = run({ [RUECK_TYPE]: 'Fachdeutsch.', [PRUEF_TYPE]: null });
    const appended = await promise;

    // Ohne diesen Satz sähe eine ungeprüfte Fassung wie eine freigegebene aus.
    expect(appended).toContain('ungeprüft');
  });

  it('prüft trotzdem, wenn die Rückübersetzung ausfällt', async () => {
    const { promise, calls } = run({ [RUECK_TYPE]: null, [PRUEF_TYPE]: 'ÜBERARBEITUNG' });
    const appended = await promise;

    const pruef = calls.find((c) => c.type === PRUEF_TYPE);
    expect(pruef?.userMessage).toContain('nicht zustande gekommen');
    expect(appended).toContain('ÜBERARBEITUNG');
  });

  it('kürzt ein überlanges Original und sagt es dem Prüfer', async () => {
    // Drei Texte plus Systemprompt müssen in ein Fenster passen. Still gekürzt
    // wäre die Abdeckungsliste unvollständig, ohne dass es jemand merkt — und
    // genau sie ist das Prüfmittel.
    const riesig = 'Ein Satz über Klimaanlagen in Pflegeheimen. '.repeat(1000);
    expect(riesig.length).toBeGreaterThan(24000);

    const { promise, calls } = run(
      { [RUECK_TYPE]: 'Fachdeutsch.', [PRUEF_TYPE]: 'ÜBERARBEITUNG' },
      { original: riesig }
    );
    await promise;

    const pruef = calls.find((c) => c.type === PRUEF_TYPE);
    expect(pruef?.userMessage.length).toBeLessThan(riesig.length);
    expect(pruef?.userMessage).toContain('Gekürzt');
  });

  it('spart die Modellaufrufe bei einer kurzen Antwort', async () => {
    const { promise, calls } = run({}, { produced: 'Kurze Rückfrage.' });
    const appended = await promise;

    expect(appended).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('prüft nicht ohne Original, sagt es aber', async () => {
    const { promise, calls } = run({}, { original: '   ' });
    const appended = await promise;

    expect(calls).toHaveLength(0);
    // Früher war dieser Zweig stumm — eine ungeprüfte Fassung sah damit aus wie
    // eine freigegebene. Genau der Fall trat bei `@dokument`-Mentions ein.
    expect(appended).toContain('ungeprüft');
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
          if (String(req.type) !== RUECK_TYPE)
            return { content: 'FREIGABE', success: true, stop_reason: 'stop' };
          await new Promise<void>((resolve) => {
            holder.release = resolve;
          });
          return { content: 'Fachdeutsch.', success: true, stop_reason: 'stop' };
        }
      );
      const promise = runAgentPipeline({
        pipeline: ES,
        state: {} as never,
        sse: sse as never,
        produced: FASSUNG,
        original: ORIGINAL,
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
describe('runAgentPipeline — Sibling bei Langsamkeit', () => {
  // Ein Lauf, in dem die Frist riss, vermerkt das Paar — der nächste Lauf ginge
  // sonst sofort zum Sibling. Im Betrieb genau richtig, hier eine
  // Verunreinigung zwischen den Fällen.
  beforeEach(() => {
    _resetModelHealthForTests();
  });

  /** Ein Pool, dessen Antwort je Provider verschieden ausfällt. */
  function poolNachProvider(handler: (provider: string, type: string) => Promise<string | null>): {
    calls: Array<{ provider: string; type: string }>;
  } {
    const calls: Array<{ provider: string; type: string }> = [];
    executeProvider.mockReset();
    executeProvider.mockImplementation(
      async (provider: string, _id: string, req: Record<string, unknown>) => {
        const type = String(req.type);
        calls.push({ provider, type });
        return { content: await handler(provider, type), success: true, stop_reason: 'stop' };
      }
    );
    return { calls };
  }

  const laufe = () =>
    runAgentPipeline({
      pipeline: ES,
      state: {} as never,
      sse: fakeSse().sse as never,
      produced: FASSUNG,
      original: ORIGINAL,
    });

  it('ruft den Sibling NICHT, wenn der Primär rechtzeitig antwortet', async () => {
    // Der teuerste Fehlgriff wäre ein Hedge, der immer feuert: jeder Schritt
    // kostete dann zwei Aufrufe, in Tokens wie in CO₂.
    const { calls } = poolNachProvider(async () => 'Fertig.');
    await laufe();

    expect(calls.map((c) => c.provider)).toEqual(['regolo', 'regolo']);
  });

  it('lässt den Sibling gewinnen, wenn der Primär über die Frist hinaus schweigt', async () => {
    vi.useFakeTimers();
    try {
      const { calls } = poolNachProvider(async (provider) => {
        // Der Primär antwortet nie — der langsame Lauf vom 14.08. im Extrem.
        if (provider === 'regolo') return new Promise<string>(() => {});
        return 'Vom Sibling.';
      });
      const promise = laufe();

      // Vor der Frist (30 s für die Rückübersetzung) darf nichts passieren.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(calls.map((c) => c.provider)).toEqual(['regolo']);

      // Reichlich: der zweite Schritt hat seine eigene, längere Frist.
      await vi.advanceTimersByTimeAsync(300_000);
      const appended = await promise;

      expect(calls.filter((c) => c.provider === 'cortecs')).not.toHaveLength(0);
      expect(appended).toContain('Vom Sibling.');
      // Und nicht als Ausfall verbucht: der Schritt hat geliefert.
      expect(appended).not.toContain('nicht zustande gekommen');
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
      poolNachProvider(async (provider) =>
        provider === 'regolo' ? new Promise<string>(() => {}) : 'Vom Sibling.'
      );
      const ersterLauf = laufe();
      await vi.advanceTimersByTimeAsync(300_000);
      await ersterLauf;

      const zweiter = poolNachProvider(async () => 'Vom Sibling.');
      await laufe();

      // Kein Tick auf der Uhr, und Regolo wurde gar nicht erst gefragt.
      expect(zweiter.calls.map((c) => c.provider)).toEqual(['cortecs', 'cortecs']);
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
      // generische Ausfallkette hinter ihm (litellm → mistral). Sonst finge die
      // Kette den Schritt ab, bevor der Hedge überhaupt drankäme — was sie in
      // Produktion auch tut, hier aber den Prüfgegenstand verdeckt.
      const { calls } = poolNachProvider(async (provider) =>
        provider === 'cortecs' ? 'Vom Sibling.' : null
      );
      const promise = laufe();
      await vi.advanceTimersByTimeAsync(0);

      // Ohne einen einzigen Tick auf der Uhr: beide Schritte sind schon durch,
      // je Schritt Primär, dessen Ausfallkette — und dann sofort der Sibling.
      expect(calls.filter((c) => c.type === RUECK_TYPE).map((c) => c.provider)).toEqual([
        'regolo',
        'litellm',
        'mistral',
        'cortecs',
      ]);
      expect(await promise).toContain('Vom Sibling.');
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
});

describe('Pipeline-Registry', () => {
  it('erkennt die eingetragenen Agenten und sonst keinen', () => {
    expect(getPipelineAgent('gruenerator-einfache-sprache')).not.toBeNull();
    expect(getPipelineAgent('gruenerator-leichte-sprache')).not.toBeNull();
    expect(getPipelineAgent('gruenerator-universal')).toBeNull();
    expect(getPipelineAgent(null)).toBeNull();
    expect(getPipelineAgent(undefined)).toBeNull();
  });

  it('bringt die Einfache-Sprache-Persona im Repo mit, Leichte Sprache nicht', () => {
    // Der Unterschied ist die Zuständigkeit, nicht die Vertraulichkeit — siehe
    // den Kopf von leichteSprache.ts.
    expect(getPipelineAgent('gruenerator-einfache-sprache')?.systemRole).toContain('B1');
    expect(getPipelineAgent('gruenerator-leichte-sprache')?.systemRole).toBeNull();
  });

  it('hält jeden Schritt für einen Ausfall sprechfähig', () => {
    // Ein Schritt ohne `missingText` wäre im Ausfall stumm, und Stille liest
    // sich hier als Freigabe. Gilt für jeden künftigen Eintrag mit.
    for (const id of ['gruenerator-einfache-sprache', 'gruenerator-leichte-sprache']) {
      const pipeline = getPipelineAgent(id);
      expect(pipeline?.steps.length).toBeGreaterThan(0);
      for (const step of pipeline?.steps ?? []) {
        expect(step.missingText.length).toBeGreaterThan(20);
        expect(step.heading).toContain('##');
      }
    }
  });
});
