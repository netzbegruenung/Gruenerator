/**
 * Das Urteil wird gerechnet, nicht erfragt: bis 19.10.2026 stand es als Wort am
 * Ende des Berichts, und ob es zu den Tabellen darüber passte, entschied das
 * Modell. Diese Tests halten die Schwellen fest, die der Code seitdem anwendet.
 */

import { describe, expect, it } from 'vitest';

import {
  nochOffen,
  nummeriert,
  offenePunkte,
  renderNachpruefung,
  renderPruefbericht,
  urteilAus,
  urteilUeber,
  validateNachpruefung,
  validatePruefbericht,
  type Nachpruefung,
  type Pruefbericht,
} from './pruefbericht.js';

type Zeile = Pruefbericht['abdeckung'][number];
type Befund = Pruefbericht['befunde'][number];

const voll = (punkt: string): Zeile => ({ punkt, status: 'vollständig', fehlt: null });

function bericht(over: Partial<Pruefbericht> = {}): Pruefbericht {
  return {
    abdeckung: [voll('a'), voll('b'), voll('c'), voll('d')],
    modalitaet: [],
    befunde: [],
    ...over,
  };
}

function befund(schweregrad: Befund['schweregrad'], over: Partial<Befund> = {}): Befund {
  return {
    stelle: 'Satz 3',
    fehlerart: 'a',
    schweregrad,
    beschreibung: 'Ortsname fehlt',
    ...over,
  };
}

describe('urteilAus', () => {
  it('KRITISCH ist ABLEHNUNG', () => {
    expect(urteilAus(bericht({ befunde: [befund('KRITISCH')] }))).toBe('ABLEHNUNG');
  });

  it('mehr als ein Viertel unvollständig ist ABLEHNUNG', () => {
    const abdeckung: Zeile[] = [
      voll('a'),
      voll('b'),
      { punkt: 'c', status: 'fehlt', fehlt: 'alles' },
      { punkt: 'd', status: 'verkürzt', fehlt: 'Ort' },
    ];
    expect(urteilAus(bericht({ abdeckung }))).toBe('ABLEHNUNG');
  });

  it('genau ein Viertel unvollständig ist noch ÜBERARBEITUNG', () => {
    const abdeckung: Zeile[] = [
      voll('a'),
      voll('b'),
      voll('c'),
      { punkt: 'd', status: 'verkürzt', fehlt: 'Ort' },
    ];
    expect(urteilAus(bericht({ abdeckung }))).toBe('ÜBERARBEITUNG');
  });

  it('eine nicht erhaltene Modalität ist ÜBERARBEITUNG', () => {
    const modalitaet = [{ original: 'könnte', fassung: 'wird', erhalten: false }];
    expect(urteilAus(bericht({ modalitaet }))).toBe('ÜBERARBEITUNG');
  });

  it('ein HOCH-Befund ist ÜBERARBEITUNG', () => {
    expect(urteilAus(bericht({ befunde: [befund('HOCH')] }))).toBe('ÜBERARBEITUNG');
  });

  it('nur MITTEL und NIEDRIG ist FREIGABE', () => {
    expect(urteilAus(bericht({ befunde: [befund('MITTEL'), befund('NIEDRIG')] }))).toBe('FREIGABE');
  });

  it('ein sauberer Bericht ist FREIGABE', () => {
    expect(urteilAus(bericht())).toBe('FREIGABE');
  });
});

describe('offenePunkte', () => {
  it('nimmt Befunde ab MITTEL, nicht NIEDRIG', () => {
    const punkte = offenePunkte(
      bericht({ befunde: [befund('MITTEL'), befund('NIEDRIG'), befund('HOCH')] })
    );
    expect(punkte.map((p) => p.schweregrad)).toEqual(['MITTEL', 'HOCH']);
  });

  it('führt Abdeckungslücken auch ohne Befund auf', () => {
    const abdeckung: Zeile[] = [
      voll('a'),
      { punkt: 'Beschluss in Sassnitz', status: 'fehlt', fehlt: 'ganzer Absatz' },
    ];
    const punkte = offenePunkte(bericht({ abdeckung }));
    expect(punkte).toHaveLength(1);
    expect(punkte[0]?.text).toContain('Beschluss in Sassnitz');
    expect(punkte[0]?.text).toContain('ganzer Absatz');
    expect(punkte[0]?.schweregrad).toBe('HOCH');
  });

  it('führt nicht erhaltene Modalität auch ohne Befund auf', () => {
    const modalitaet = [
      { original: 'könnte', fassung: null, erhalten: false },
      { original: 'soll', fassung: 'soll', erhalten: true },
    ];
    const punkte = offenePunkte(bericht({ modalitaet }));
    expect(punkte).toHaveLength(1);
    expect(punkte[0]?.text).toContain('könnte');
    expect(punkte[0]?.text).toContain('nicht gefunden');
  });

  it('gibt bei einem sauberen Bericht nichts auf', () => {
    expect(offenePunkte(bericht())).toEqual([]);
  });
});

describe('nochOffen', () => {
  const vorher = offenePunkte(
    bericht({ befunde: [befund('HOCH', { stelle: 'A' }), befund('HOCH', { stelle: 'B' })] })
  );

  it('zählt einen nicht erwähnten Punkt als offen', () => {
    const np: Nachpruefung = { punkte: [{ nr: 1, behoben: true }], neue_befunde: [] };
    const rest = nochOffen(vorher, np);
    expect(rest).toHaveLength(1);
    expect(rest[0]?.text).toContain('bei B');
  });

  it('streicht behobene Punkte', () => {
    const np: Nachpruefung = {
      punkte: [
        { nr: 1, behoben: true },
        { nr: 2, behoben: true },
      ],
      neue_befunde: [],
    };
    expect(nochOffen(vorher, np)).toEqual([]);
  });

  it('ein als nicht behoben gemeldeter Punkt bleibt', () => {
    const np: Nachpruefung = {
      punkte: [
        { nr: 1, behoben: false },
        { nr: 2, behoben: true },
      ],
      neue_befunde: [],
    };
    expect(nochOffen(vorher, np)).toHaveLength(1);
  });

  it('nimmt neue Befunde ab MITTEL auf, NIEDRIG nicht', () => {
    const np: Nachpruefung = {
      punkte: [
        { nr: 1, behoben: true },
        { nr: 2, behoben: true },
      ],
      neue_befunde: [befund('MITTEL'), befund('NIEDRIG')],
    };
    expect(nochOffen(vorher, np)).toHaveLength(1);
  });
});

describe('urteilUeber', () => {
  it('rechnet auf derselben Skala', () => {
    const p = (schweregrad: 'KRITISCH' | 'HOCH' | 'MITTEL') => ({
      text: 'x',
      schweregrad,
      korrektur: null,
    });
    expect(urteilUeber([])).toBe('FREIGABE');
    expect(urteilUeber([p('MITTEL')])).toBe('FREIGABE');
    expect(urteilUeber([p('MITTEL'), p('HOCH')])).toBe('ÜBERARBEITUNG');
    expect(urteilUeber([p('HOCH'), p('KRITISCH')])).toBe('ABLEHNUNG');
  });
});

describe('nummeriert', () => {
  it('zählt ab 1 und hängt den Vorschlag ein', () => {
    const text = nummeriert([
      { text: 'Erstens', schweregrad: 'HOCH', korrektur: 'Besser so' },
      { text: 'Zweitens', schweregrad: 'MITTEL', korrektur: null },
    ]);
    expect(text).toBe('1. [HOCH] Erstens\n   Vorschlag: Besser so\n2. [MITTEL] Zweitens');
  });
});

describe('validatePruefbericht', () => {
  const roh = (
    befunde: unknown[],
    abdeckung: unknown[] = [{ punkt: 'a', status: 'vollständig' }]
  ) => ({
    abdeckung,
    modalitaet: [],
    befunde,
  });

  it("nimmt von 'c) MODALITÄTS-FEHLER' den Buchstaben", () => {
    const r = validatePruefbericht(
      roh([
        { stelle: 's', fehlerart: 'c) MODALITÄTS-FEHLER', schweregrad: 'HOCH', beschreibung: 'b' },
      ])
    );
    expect(r.ok && r.value.befunde[0]?.fehlerart).toBe('c');
  });

  it("macht aus 'hoch' HOCH", () => {
    const r = validatePruefbericht(
      roh([{ stelle: 's', fehlerart: 'a', schweregrad: ' hoch ', beschreibung: 'b' }])
    );
    expect(r.ok && r.value.befunde[0]?.schweregrad).toBe('HOCH');
  });

  it('fällt bei unbekannter Fehlerart auf Regelverstoß und bei unbekannter Schwere auf MITTEL', () => {
    const r = validatePruefbericht(
      roh([{ stelle: 's', fehlerart: 'z', schweregrad: 'schlimm', beschreibung: 'b' }])
    );
    expect(r.ok && r.value.befunde[0]?.fehlerart).toBe('r');
    expect(r.ok && r.value.befunde[0]?.schweregrad).toBe('MITTEL');
  });

  it("macht aus unbekanntem Abdeckungsstatus 'verkürzt'", () => {
    const r = validatePruefbericht(roh([], [{ punkt: 'a', status: 'teilweise' }]));
    expect(r.ok && r.value.abdeckung[0]?.status).toBe('verkürzt');
  });

  it('weist eine leere Abdeckung zurück', () => {
    const r = validatePruefbericht(roh([], []));
    expect(r.ok).toBe(false);
  });

  it('weist Müll zurück', () => {
    expect(validatePruefbericht('kein Objekt').ok).toBe(false);
    expect(validatePruefbericht(null).ok).toBe(false);
  });
});

describe('validateNachpruefung', () => {
  it('erlaubt fehlende neue_befunde und liest nr als Zahl', () => {
    const r = validateNachpruefung({ punkte: [{ nr: '2', behoben: true }] });
    expect(r.ok && r.value.punkte[0]?.nr).toBe(2);
    expect(r.ok && r.value.neue_befunde).toEqual([]);
  });
});

describe('renderPruefbericht', () => {
  it('maskiert | in Zellen, damit die Tabelle nicht aufbricht', () => {
    const b = bericht({
      abdeckung: [{ punkt: 'links | rechts', status: 'fehlt', fehlt: 'a|b' }],
      befunde: [befund('HOCH', { beschreibung: 'x | y' })],
    });
    const md = renderPruefbericht(b, urteilAus(b));
    expect(md).toContain('links \\| rechts');
    expect(md).toContain('a\\|b');
    expect(md).toContain('x \\| y');
    expect(md).toContain('**Urteil: ABLEHNUNG**');
  });

  it('sagt es, wenn es keine Befunde gibt', () => {
    expect(renderPruefbericht(bericht(), 'FREIGABE')).toContain('Keine Befunde.');
  });
});

describe('renderNachpruefung', () => {
  it('nennt nicht erwähnte Punkte „nicht geprüft → offen"', () => {
    const vorher = offenePunkte(bericht({ befunde: [befund('HOCH')] }));
    const np: Nachpruefung = { punkte: [], neue_befunde: [] };
    const md = renderNachpruefung(vorher, np, nochOffen(vorher, np));
    expect(md).toContain('nicht geprüft → offen');
    expect(md).toContain('**Urteil: ÜBERARBEITUNG**');
  });
});
