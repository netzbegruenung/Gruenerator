/**
 * The "what still has to be attached" list: for every line the user filled,
 * which documents the NRW rules require, and whether one of that kind has been
 * uploaded. Also cross-checks the uploaded belege against the entered amounts
 * (formerly a server route — it needs nothing the browser does not have).
 */
import { type BelegKategorie, type BelegMeta, type ReisekostenState } from '@gruenerator/contracts';

import { BELEG_KATEGORIEN, betragAusBelegen, type BelegPosten } from './belegKategorien.js';
import { getRate } from './rateConfig.js';

export type PruefStatus = 'ok' | 'fehlt' | 'hinweis';

export interface PruefPunkt {
  id: string;
  status: PruefStatus;
  label: string;
  detail?: string;
  /** Form line the item belongs to — the UI scrolls there on click. */
  posten: BelegPosten;
}

/**
 * Findings of `validateReisekosten` that only say "a beleg is missing". The
 * checklist states the same thing with more detail, so the UI hides these.
 */
export const BELEG_FINDING_FIELDS: ReadonlySet<string> = new Set([
  'fahrt.bahn',
  'fahrt.oepnv',
  'fahrt.kfz.routenplanerVorhanden',
  'fahrt.miete',
  'fahrt.taxi',
]);

function has(belege: BelegMeta[], ...kategorien: BelegKategorie[]): boolean {
  return belege.some((b) => kategorien.includes(b.kategorie));
}

function euro(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

export function pruefliste(state: ReisekostenState, belege: BelegMeta[]): PruefPunkt[] {
  const rate = getRate(state.rateKey);
  const items: PruefPunkt[] = [];
  const require = (
    id: string,
    posten: BelegPosten,
    label: string,
    ok: boolean,
    detail?: string
  ): void => {
    items.push({ id, posten, label, status: ok ? 'ok' : 'fehlt', ...(detail ? { detail } : {}) });
  };
  const hint = (id: string, posten: BelegPosten, label: string, detail: string): void => {
    items.push({ id, posten, label, status: 'hinweis', detail });
  };

  const { fahrt, uebernachtung } = state;

  if (fahrt.bahn && fahrt.bahn.betrag > 0) {
    require('bahn-beleg', 'bahn', 'Bahn: Originalbeleg (DB-Rechnung oder Ticket)', has(
      belege,
      'db_rechnung',
      'db_ticket'
    ));
    if (!has(belege, 'flexpreis_vergleich')) {
      hint(
        'bahn-flexpreis',
        'bahn',
        'Bahn: Flexpreis-Vergleich',
        'Nur nötig, wenn die Fahrt nicht am 1. Wohnsitz beginnt oder endet – dann vor Reiseantritt ausdrucken.'
      );
    }
  }

  if (fahrt.oepnv && fahrt.oepnv.betrag > 0) {
    require('oepnv-beleg', 'oepnv', 'ÖPNV: Originalbeleg', has(
      belege,
      'oepnv_ticket',
      'deutschlandticket'
    ));
  }
  if (has(belege, 'deutschlandticket')) {
    hint(
      'deutschlandticket',
      'oepnv',
      'Deutschlandticket: nur anteilig',
      'Erstattet wird höchstens der Monatspreis, anteilig über alle Reisen. Belege vergleichbarer Nahverkehrsfahrten beifügen.'
    );
  }

  const kfz = fahrt.kfz;
  if (kfz && kfz.km > 0) {
    require('kfz-routenplaner', 'kfz', 'Kfz: Routenplaner-Ausdruck (kürzeste Strecke)', has(
      belege,
      'routenplaner'
    ));
    if (kfz.km > rate.kmObergrenze && kfz.vorstandsbeschluss) {
      require('kfz-beschluss', 'kfz', `Kfz: Vorstandsbeschluss für mehr als ${rate.kmObergrenze} km`, has(
        belege,
        'vorstandsbeschluss'
      ));
    }
  }

  const miete = fahrt.miete;
  if (miete && miete.betrag > 0) {
    require('miete-rechnung', 'miete', 'Mietwagen: Originalrechnung', has(
      belege,
      'mietwagenrechnung'
    ));
    require('miete-beschluss', 'miete', 'Mietwagen: Vorstandsbeschluss', has(
      belege,
      'vorstandsbeschluss'
    ));
    require('miete-routenplaner', 'miete', 'Mietwagen: Routenplaner-Ausdruck (kürzeste Strecke)', has(
      belege,
      'routenplaner'
    ));
  }

  if (fahrt.taxi && fahrt.taxi.betrag > 0) {
    require('taxi-quittung', 'taxi', 'Taxi: Quittung mit Start, Ziel und Steuersatz', has(
      belege,
      'taxiquittung'
    ));
  }

  if (fahrt.sonstiges && fahrt.sonstiges.betrag > 0) {
    require('sonstiges-beleg', 'sonstiges', 'Sonstiges: Beleg', has(
      belege,
      'parkbeleg',
      'teilnahmebeitrag',
      'sonstiges'
    ));
  }

  if (uebernachtung?.modus === 'beleg') {
    require('hotel-rechnung', 'uebernachtung', 'Übernachtung: Rechnung', has(
      belege,
      'hotelrechnung'
    ));
    if (belege.some((b) => b.kategorie === 'hotelrechnung' && b.businessPackage === false)) {
      hint(
        'hotel-fruehstueck',
        'uebernachtung',
        'Hotelfrühstück',
        'Das Frühstück ist als „Frühstück“ ausgewiesen. Erstattungsfähig nur bei Kleinbetragsrechnungen bis 250 € (abzüglich 5,60 €), sonst gar nicht.'
      );
    }
  }

  // Entered amount vs. what the belege of that line add up to.
  const entered: Array<[BelegPosten, number | undefined]> = [
    ['bahn', fahrt.bahn?.betrag],
    ['oepnv', fahrt.oepnv?.betrag],
    ['miete', fahrt.miete?.betrag],
    ['taxi', fahrt.taxi?.betrag],
    ['sonstiges', fahrt.sonstiges?.betrag],
    [
      'uebernachtung',
      uebernachtung?.modus === 'beleg' ? (uebernachtung.betrag ?? undefined) : undefined,
    ],
  ];
  for (const [posten, value] of entered) {
    const ausBelegen = betragAusBelegen(belege, posten);
    if (value !== undefined && ausBelegen !== null && Math.abs(ausBelegen - value) > 0.01) {
      hint(
        `${posten}-abweichung`,
        posten,
        'Betrag weicht von den Belegen ab',
        `Belege: ${euro(ausBelegen)}, eingetragen: ${euro(value)}.`
      );
    }
  }

  return items;
}

/** Labels for the categories the user picks from when correcting a beleg. */
export const BELEG_KATEGORIE_OPTIONEN = (Object.keys(BELEG_KATEGORIEN) as BelegKategorie[]).map(
  (k) => ({ value: k, label: BELEG_KATEGORIEN[k].label })
);
