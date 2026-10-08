import { type ReisekostenState } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { computeReisekosten } from './compute.js';
import { validateReisekosten } from './validate.js';

function makeState(overrides: Partial<ReisekostenState> = {}): ReisekostenState {
  return {
    rateKey: 'de-DE/nrw',
    stammdaten: {
      name: 'Moritz Wächter',
      strasse: 'Villestr.',
      hausnr: '6',
      plz: '53347',
      ort: 'Alfter',
      email: 'test@example.org',
      iban: 'DE00',
    },
    reise: {
      anlass: 'Länderrat',
      ziel: 'Westhafenstraße 1, 13353 Berlin',
      reisebeginn: '2025-04-05T11:15',
      rueckkehr: '2025-04-06T23:59',
    },
    fahrt: {
      bahn: null,
      oepnv: null,
      kfz: null,
      miete: null,
      taxi: null,
      sonstiges: null,
    },
    verpflegungAbzuege: [],
    uebernachtung: null,
    spende: 0,
    ...overrides,
  };
}

describe('computeReisekosten — official NRW worked example', () => {
  it('reproduces 325,13 gesamt and 270,58 Auszahlung', () => {
    const state = makeState({
      fahrt: {
        bahn: { betrag: 164.69, belegVorhanden: true },
        oepnv: null,
        kfz: null,
        miete: null,
        taxi: null,
        sonstiges: null,
      },
      // Hotel breakfast on the departure day → -5,60 deduction.
      verpflegungAbzuege: [
        { datum: '2025-04-06', fruehstueck: true, mittagessen: false, abendessen: false },
      ],
      uebernachtung: { modus: 'beleg', betrag: 138.04, naechte: null },
      spende: 54.55,
    });

    const r = computeReisekosten(state);

    expect(r.fahrtkosten.summe).toBe(164.69);
    expect(r.verpflegung.summe).toBe(22.4); // 14 + (14 - 5,60)
    expect(r.uebernachtung.summe).toBe(138.04);
    expect(r.gesamt).toBe(325.13);
    expect(r.auszahlung).toBe(270.58);
  });
});

describe('Kfz 500-km cap (form 1.7.2025, rule 1.3)', () => {
  const kfz = (km: number, vorstandsbeschluss?: boolean) =>
    makeState({
      fahrt: {
        bahn: null,
        oepnv: null,
        kfz: {
          km,
          fahrzeug: 'pkw' as const,
          routenplanerVorhanden: true,
          dbFlexpreis: null,
          ...(vorstandsbeschluss != null && { vorstandsbeschluss }),
        },
        miete: null,
        taxi: null,
        sonstiges: null,
      },
    });

  it('300 km → 90,00 €', () => {
    expect(computeReisekosten(kfz(300)).fahrtkosten.kfz).toBe(90);
  });

  it('500 km → 150,00 € (cap)', () => {
    expect(computeReisekosten(kfz(500)).fahrtkosten.kfz).toBe(150);
  });

  it('600 km without Vorstandsbeschluss → capped at 500 km', () => {
    expect(computeReisekosten(kfz(600)).fahrtkosten.kfz).toBe(150);
  });

  it('600 km with Vorstandsbeschluss → the Mehr-km count at 0,30 €', () => {
    expect(computeReisekosten(kfz(600, true)).fahrtkosten.kfz).toBe(180);
  });
});

describe('Verpflegung — Mitternachtsregelung & Deckel', () => {
  it('one-day trip returning after midnight (no overnight) = 14 € for the departure day only', () => {
    const state = makeState({
      reise: {
        anlass: 'Termin',
        ziel: 'Köln',
        reisebeginn: '2025-04-07T16:30',
        rueckkehr: '2025-04-08T02:00',
      },
      uebernachtung: null,
    });
    const r = computeReisekosten(state);
    expect(r.verpflegung.tage).toHaveLength(1);
    expect(r.verpflegung.summe).toBe(14);
  });

  it('deduction is capped at the day allowance (14 €, not 16,80 €)', () => {
    const state = makeState({
      reise: {
        anlass: 'Termin',
        ziel: 'Köln',
        reisebeginn: '2025-04-07T08:00',
        rueckkehr: '2025-04-07T20:00',
      },
      verpflegungAbzuege: [
        { datum: '2025-04-07', fruehstueck: true, mittagessen: true, abendessen: false },
      ],
      uebernachtung: null,
    });
    const r = computeReisekosten(state);
    expect(r.verpflegung.tage[0].abzug).toBe(14);
    expect(r.verpflegung.summe).toBe(0);
  });

  it('absence ≤ 8 h → no allowance', () => {
    const state = makeState({
      reise: {
        anlass: 'Termin',
        ziel: 'Köln',
        reisebeginn: '2025-04-07T09:00',
        rueckkehr: '2025-04-07T16:00',
      },
      uebernachtung: null,
    });
    expect(computeReisekosten(state).verpflegung.summe).toBe(0);
  });
});

describe('validateReisekosten', () => {
  it('flags the exceeded 3-month deadline', () => {
    const state = makeState();
    const findings = validateReisekosten(state, new Date('2025-08-01T12:00'));
    expect(findings.some((f) => f.level === 'error' && f.field === 'reise.belegdatum')).toBe(true);
  });

  it('warns when a multi-day trip has no overnight and is thus counted as one day', () => {
    const state = makeState({ uebernachtung: null });
    state.reise.reisebeginn = '2026-11-13T14:00';
    state.reise.rueckkehr = '2026-11-15T18:00';
    const warns = (s: typeof state) =>
      validateReisekosten(s, new Date('2026-11-20T12:00')).some(
        (f) => f.field === 'uebernachtung' && f.level === 'warn'
      );
    expect(warns(state)).toBe(true);
    expect(
      warns({ ...state, uebernachtung: { modus: 'pauschal', betrag: null, naechte: 2 } })
    ).toBe(false);
  });

  it('warns about Kfz > 500 km without a Vorstandsbeschluss', () => {
    const state = makeState({
      fahrt: {
        bahn: null,
        oepnv: null,
        kfz: { km: 600, fahrzeug: 'pkw', routenplanerVorhanden: true, dbFlexpreis: null },
        miete: null,
        taxi: null,
        sonstiges: null,
      },
    });
    const findings = validateReisekosten(state, new Date('2025-04-10T12:00'));
    expect(
      findings.some((f) => f.field === 'fahrt.kfz.vorstandsbeschluss' && f.level === 'warn')
    ).toBe(true);
  });

  it('rejects a rental car without a Vorstandsbeschluss, accepts it with one', () => {
    const withMiete = (vorstandsbeschluss: boolean) =>
      makeState({
        fahrt: {
          bahn: null,
          oepnv: null,
          kfz: null,
          miete: { betrag: 80, dbFlexpreis: null, belegVorhanden: true, vorstandsbeschluss },
          taxi: null,
          sonstiges: null,
        },
      });
    const isMieteError = (f: { field: string; level: string }) =>
      f.field === 'fahrt.miete.vorstandsbeschluss' && f.level === 'error';
    const now = new Date('2025-04-10T12:00');
    expect(validateReisekosten(withMiete(false), now).some(isMieteError)).toBe(true);
    expect(validateReisekosten(withMiete(true), now).some(isMieteError)).toBe(false);
  });

  it('passes a clean, timely form', () => {
    const state = makeState({
      fahrt: {
        bahn: { betrag: 164.69, belegVorhanden: true },
        oepnv: null,
        kfz: null,
        miete: null,
        taxi: null,
        sonstiges: null,
      },
      uebernachtung: { modus: 'beleg', betrag: 138.04, naechte: null },
    });
    const findings = validateReisekosten(state, new Date('2025-04-10T12:00'));
    expect(findings.filter((f) => f.level === 'error')).toHaveLength(0);
  });
});
