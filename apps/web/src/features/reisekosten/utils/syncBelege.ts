import {
  BELEG_KATEGORIEN,
  betragAusBelegen,
  postenOf,
  type BelegPosten,
} from '@gruenerator/shared/reisekosten';

import type { BelegKategorie, BelegMeta, ReisekostenState } from '@gruenerator/contracts';

const has = (belege: BelegMeta[], ...k: BelegKategorie[]) =>
  belege.some((b) => k.includes(b.kategorie));

/**
 * Derives the "Beleg liegt vor" flags from what was uploaded — the user no
 * longer ticks them by hand, the documents are the evidence.
 */
function syncFlags(state: ReisekostenState, belege: BelegMeta[]): ReisekostenState {
  const f = state.fahrt;
  return {
    ...state,
    fahrt: {
      ...f,
      bahn: f.bahn && { ...f.bahn, belegVorhanden: has(belege, 'db_rechnung', 'db_ticket') },
      oepnv: f.oepnv && {
        ...f.oepnv,
        belegVorhanden: has(belege, 'oepnv_ticket', 'deutschlandticket'),
      },
      kfz: f.kfz && { ...f.kfz, routenplanerVorhanden: has(belege, 'routenplaner') },
      miete: f.miete && { ...f.miete, belegVorhanden: has(belege, 'mietwagenrechnung') },
      taxi: f.taxi && { ...f.taxi, belegVorhanden: has(belege, 'taxiquittung') },
    },
  };
}

/** Puts the belege total into one line, switching the line on if it was off. */
function prefillPosten(
  state: ReisekostenState,
  belege: BelegMeta[],
  posten: BelegPosten
): ReisekostenState {
  const betrag = betragAusBelegen(belege, posten);
  if (betrag === null) return state;
  const f = state.fahrt;
  switch (posten) {
    case 'bahn':
      return { ...state, fahrt: { ...f, bahn: { betrag, belegVorhanden: true } } };
    case 'oepnv':
      return { ...state, fahrt: { ...f, oepnv: { betrag, belegVorhanden: true } } };
    case 'miete':
      return {
        ...state,
        fahrt: {
          ...f,
          miete: { ...(f.miete ?? { dbFlexpreis: null }), betrag, belegVorhanden: true },
        },
      };
    case 'taxi':
      return {
        ...state,
        fahrt: {
          ...f,
          taxi: { begruendung: f.taxi?.begruendung ?? '', betrag, belegVorhanden: true },
        },
      };
    case 'sonstiges': {
      const labels = [
        ...new Set(
          belege
            .filter((b) => postenOf(b) === 'sonstiges')
            .map((b) => BELEG_KATEGORIEN[b.kategorie].label)
        ),
      ];
      return {
        ...state,
        fahrt: {
          ...f,
          sonstiges: { betrag, beschreibung: f.sonstiges?.beschreibung || labels.join(', ') },
        },
      };
    }
    case 'uebernachtung':
      return { ...state, uebernachtung: { modus: 'beleg', betrag, naechte: null } };
    case 'kfz':
      return state;
  }
}

/**
 * Applies the belege to the form. Amounts are only (re)filled for the lines the
 * changed belege belong to, so a correction the user typed into another line
 * survives the next upload.
 */
export function syncBelege(
  state: ReisekostenState,
  belege: BelegMeta[],
  geaendert: BelegMeta[]
): ReisekostenState {
  let next = state;
  for (const posten of new Set(geaendert.map(postenOf))) next = prefillPosten(next, belege, posten);
  return syncFlags(next, belege);
}
