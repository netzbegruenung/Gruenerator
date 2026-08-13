/**
 * Was hier festgehalten wird, ist nicht die Formatierung der Ausgabe, sondern
 * die Bauform: dass die Prüfung überhaupt stattfindet, dass sie den ES-Text und
 * NUR den ES-Text sieht, und dass ein Ausfall benannt statt verschwiegen wird.
 * Alle drei waren im Lauf vom 13.08.2026 verletzt — der eine Turn bewertete
 * sich selbst und meldete „vollständig", während ein Ortsname fehlte.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const rueckMock = vi.hoisted(() => vi.fn());
const pruefMock = vi.hoisted(() => vi.fn());

vi.mock(
  '../../../agents/langgraph/ChatGraph/nodes/einfacheSpracheRueckuebersetzungNode.js',
  () => ({ einfacheSpracheRueckuebersetzungNode: rueckMock })
);
vi.mock('../../../agents/langgraph/ChatGraph/nodes/einfacheSprachePruefungNode.js', () => ({
  einfacheSprachePruefungNode: pruefMock,
}));

const { isEinfacheSpracheAgent, runEinfacheSprachePruefkette } = await import(
  './einfacheSpracheTurn.js'
);

/** Über der MIN_ES_CHARS-Schwelle, damit die Kette überhaupt anläuft. */
const ES_TEXT = 'Die Grünen fordern ein Sofortprogramm. '.repeat(15);
const ORIGINAL = 'Auf dem Parteitag in Sassnitz beschlossen die Grünen ein Sofortprogramm.';

interface Sent {
  event: string;
  payload: Record<string, unknown>;
}

function fakeSse(): { sse: { send: (e: string, p: unknown) => void }; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    sse: {
      send: (event: string, payload: unknown) => {
        sent.push({ event, payload: payload as Record<string, unknown> });
      },
    },
  };
}

function run(overrides: { esText?: string; original?: string } = {}) {
  const { sse, sent } = fakeSse();
  const promise = runEinfacheSprachePruefkette({
    state: {} as never,
    sse: sse as never,
    esText: overrides.esText ?? ES_TEXT,
    original: overrides.original ?? ORIGINAL,
  });
  return { promise, sent };
}

const text = (sent: Sent[]): string =>
  sent
    .filter((s) => s.event === 'text_delta')
    .map((s) => String(s.payload.text))
    .join('');

describe('runEinfacheSprachePruefkette', () => {
  beforeEach(() => {
    rueckMock.mockReset();
    pruefMock.mockReset();
  });

  it('reicht der Rückübersetzung NUR die ES-Fassung, nie das Original', async () => {
    rueckMock.mockResolvedValue('Fachdeutsche Fassung.');
    pruefMock.mockResolvedValue('FREIGABE');

    const { promise } = run();
    await promise;

    // Der eigentliche Befund: der zweite Parameter ist der ES-Text, und das
    // Original taucht in diesem Aufruf nirgends auf. Wäre es dabei, wäre die
    // „blinde" Rückübersetzung eine Rekonstruktion und als Prüfmittel wertlos.
    expect(rueckMock).toHaveBeenCalledTimes(1);
    expect(rueckMock.mock.calls[0]?.[1]).toBe(ES_TEXT);
    expect(JSON.stringify(rueckMock.mock.calls[0])).not.toContain('Sassnitz');
  });

  it('gibt der Prüfung alle drei Texte', async () => {
    rueckMock.mockResolvedValue('Fachdeutsche Fassung.');
    pruefMock.mockResolvedValue('ÜBERARBEITUNG');

    const { promise } = run();
    await promise;

    expect(pruefMock).toHaveBeenCalledTimes(1);
    expect(pruefMock.mock.calls[0]?.[1]).toEqual({
      original: ORIGINAL,
      esText: ES_TEXT,
      rueckuebersetzung: 'Fachdeutsche Fassung.',
    });
  });

  it('strömt beide Teile und gibt exakt das Angehängte zurück', async () => {
    rueckMock.mockResolvedValue('Fachdeutsche Fassung.');
    pruefMock.mockResolvedValue('FREIGABE, keine Befunde.');

    const { promise, sent } = run();
    const appended = await promise;

    expect(appended).toContain('Fachdeutsche Fassung.');
    expect(appended).toContain('FREIGABE, keine Befunde.');
    // Rückgabewert und Bildschirm müssen deckungsgleich sein — sonst zeigt ein
    // Neuladen des Threads etwas anderes als der Lauf.
    expect(text(sent)).toBe(appended);
  });

  it('benennt eine ausgefallene Prüfung, statt sie zu verschweigen', async () => {
    rueckMock.mockResolvedValue('Fachdeutsche Fassung.');
    pruefMock.mockResolvedValue(null);

    const { promise } = run();
    const appended = await promise;

    // Ohne diesen Satz sähe eine ungeprüfte Fassung wie eine freigegebene aus.
    expect(appended).toContain('ungeprüft');
  });

  it('prüft trotzdem, wenn die Rückübersetzung ausfällt', async () => {
    rueckMock.mockResolvedValue(null);
    pruefMock.mockResolvedValue('ÜBERARBEITUNG');

    const { promise } = run();
    const appended = await promise;

    expect(pruefMock.mock.calls[0]?.[1]).toMatchObject({ rueckuebersetzung: null });
    expect(appended).toContain('ÜBERARBEITUNG');
  });

  it('spart die zwei Modellaufrufe bei einer kurzen Antwort', async () => {
    const { promise } = run({ esText: 'Kurze Rückfrage.' });
    const appended = await promise;

    expect(appended).toBe('');
    expect(rueckMock).not.toHaveBeenCalled();
    expect(pruefMock).not.toHaveBeenCalled();
  });

  it('prüft nicht ohne Original — es gäbe nichts zu vergleichen', async () => {
    const { promise } = run({ original: '   ' });
    const appended = await promise;

    expect(appended).toBe('');
    expect(pruefMock).not.toHaveBeenCalled();
  });
});

describe('isEinfacheSpracheAgent', () => {
  it('erkennt genau den einen Agenten', () => {
    expect(isEinfacheSpracheAgent('gruenerator-einfache-sprache')).toBe(true);
    expect(isEinfacheSpracheAgent('gruenerator-leichte-sprache')).toBe(false);
    expect(isEinfacheSpracheAgent(null)).toBe(false);
    expect(isEinfacheSpracheAgent(undefined)).toBe(false);
  });
});
