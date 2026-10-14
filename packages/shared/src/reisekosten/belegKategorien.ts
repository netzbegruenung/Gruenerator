/**
 * What each beleg category is, and which form line it belongs to. The single
 * place that knows "a DB-Rechnung pays for 1.1 Bahn" — the classifier names the
 * category, the form, the checklist and the PDF order all read it from here.
 */
import { type BelegKategorie, type BelegMeta } from '@gruenerator/contracts';

/** A form line a beleg can support. `uebernachtung` is section 3 (Beleg mode). */
export type BelegPosten =
  'bahn' | 'oepnv' | 'kfz' | 'miete' | 'taxi' | 'sonstiges' | 'uebernachtung';

export interface BelegKategorieInfo {
  label: string;
  posten: BelegPosten;
  /** True when the document's amount is what the line reimburses (an invoice), false for evidence (a route printout). */
  traegtBetrag: boolean;
}

export const BELEG_KATEGORIEN: Record<BelegKategorie, BelegKategorieInfo> = {
  db_rechnung: { label: 'DB-Rechnung', posten: 'bahn', traegtBetrag: true },
  db_ticket: { label: 'DB-Ticket', posten: 'bahn', traegtBetrag: true },
  flexpreis_vergleich: { label: 'Flexpreis-Vergleich', posten: 'bahn', traegtBetrag: false },
  oepnv_ticket: { label: 'ÖPNV-Ticket', posten: 'oepnv', traegtBetrag: true },
  // Reimbursed pro rata only, so its price is not the line's amount.
  deutschlandticket: { label: 'Deutschlandticket', posten: 'oepnv', traegtBetrag: false },
  routenplaner: { label: 'Routenplaner-Ausdruck', posten: 'kfz', traegtBetrag: false },
  vorstandsbeschluss: { label: 'Vorstandsbeschluss', posten: 'kfz', traegtBetrag: false },
  mietwagenrechnung: {
    label: 'Mietwagen-/Carsharing-Rechnung',
    posten: 'miete',
    traegtBetrag: true,
  },
  taxiquittung: { label: 'Taxiquittung', posten: 'taxi', traegtBetrag: true },
  parkbeleg: { label: 'Parkbeleg', posten: 'sonstiges', traegtBetrag: true },
  teilnahmebeitrag: { label: 'Teilnahmebeitrag', posten: 'sonstiges', traegtBetrag: true },
  sonstiges: { label: 'Sonstiger Beleg', posten: 'sonstiges', traegtBetrag: true },
  hotelrechnung: { label: 'Hotelrechnung', posten: 'uebernachtung', traegtBetrag: true },
};

/** Form order of the lines — the order belege are attached in the PDF. */
export const POSTEN_REIHENFOLGE: BelegPosten[] = [
  'bahn',
  'oepnv',
  'kfz',
  'miete',
  'taxi',
  'sonstiges',
  'uebernachtung',
];

export const POSTEN_LABEL: Record<BelegPosten, string> = {
  bahn: '1.1 Bahn',
  oepnv: '1.2 ÖPNV',
  kfz: '1.3 Kfz',
  miete: '1.4 Mietkosten',
  taxi: '1.5 Taxi',
  sonstiges: '1.6 Sonstiges',
  uebernachtung: '3. Übernachtung',
};

export function postenOf(beleg: Pick<BelegMeta, 'kategorie'>): BelegPosten {
  return BELEG_KATEGORIEN[beleg.kategorie].posten;
}

/** Belege sorted into form order, stable within a line. */
export function sortBelegeNachFormular<T extends Pick<BelegMeta, 'kategorie'>>(belege: T[]): T[] {
  return belege
    .map((b, i) => ({ b, i, p: POSTEN_REIHENFOLGE.indexOf(postenOf(b)) }))
    .sort((x, y) => x.p - y.p || x.i - y.i)
    .map((x) => x.b);
}

/**
 * The amount the belege of one line add up to, or null if none carries one.
 * A DB-Rechnung and the matching ticket describe the same journey, so when
 * invoices exist the tickets are not added on top.
 */
export function betragAusBelegen(belege: BelegMeta[], posten: BelegPosten): number | null {
  let relevant = belege.filter(
    (b) => postenOf(b) === posten && BELEG_KATEGORIEN[b.kategorie].traegtBetrag && b.betrag != null
  );
  if (posten === 'bahn' && relevant.some((b) => b.kategorie === 'db_rechnung')) {
    relevant = relevant.filter((b) => b.kategorie === 'db_rechnung');
  }
  if (relevant.length === 0) return null;
  const sum = relevant.reduce((acc, b) => acc + (b.betrag ?? 0), 0);
  return Math.round(sum * 100) / 100;
}
