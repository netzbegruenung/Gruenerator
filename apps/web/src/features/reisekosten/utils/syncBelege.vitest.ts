import { type BelegKategorie, type BelegMeta } from '@gruenerator/contracts';
import { emptyReisekostenState } from '@gruenerator/shared/reisekosten';
import { describe, expect, it } from 'vitest';

import { syncBelege } from './syncBelege';

function beleg(
  kategorie: BelegKategorie,
  betrag: number | null,
  id: string = kategorie
): BelegMeta {
  return {
    id,
    dateiname: id,
    mimeType: 'application/pdf',
    groesse: 1,
    sha256: id,
    kategorie,
    betrag,
    datum: null,
    von: null,
    nach: null,
    businessPackage: null,
    quelle: 'lokal',
  };
}

describe('syncBelege', () => {
  it('switches a line on and fills it from a new invoice', () => {
    const b = beleg('db_rechnung', 87.4);
    const next = syncBelege(emptyReisekostenState(), [b], [b]);
    expect(next.fahrt.bahn).toEqual({ betrag: 87.4, belegVorhanden: true });
  });

  it('leaves a corrected amount on another line alone', () => {
    const state = emptyReisekostenState();
    state.fahrt.bahn = { betrag: 70, belegVorhanden: true };
    const bahn = beleg('db_ticket', 87.4);
    const taxi = beleg('taxiquittung', 18.4);
    const next = syncBelege(state, [bahn, taxi], [taxi]);
    expect(next.fahrt.bahn?.betrag).toBe(70);
    expect(next.fahrt.taxi?.betrag).toBe(18.4);
  });

  it('ticks the route printout once one is uploaded', () => {
    const state = emptyReisekostenState();
    state.fahrt.kfz = { km: 120, fahrzeug: 'pkw', routenplanerVorhanden: false, dbFlexpreis: null };
    const r = beleg('routenplaner', null);
    expect(syncBelege(state, [r], [r]).fahrt.kfz?.routenplanerVorhanden).toBe(true);
  });

  it('puts a hotel invoice into section 3 as Beleg', () => {
    const h = beleg('hotelrechnung', 103.5);
    expect(syncBelege(emptyReisekostenState(), [h], [h]).uebernachtung).toEqual({
      modus: 'beleg',
      betrag: 103.5,
      naechte: null,
    });
  });
});

describe('syncBelege – explicit Übernachtung choice', () => {
  it('keeps "vom Verband bezahlt" when a hotel invoice is uploaded', () => {
    const state = emptyReisekostenState();
    state.uebernachtung = { modus: 'lv_bezahlt', betrag: null, naechte: null };
    const h = beleg('hotelrechnung', 103.5);
    expect(syncBelege(state, [h], [h]).uebernachtung).toEqual(state.uebernachtung);
  });

  it('updates only the amount when the section is already "laut Beleg"', () => {
    const state = emptyReisekostenState();
    state.uebernachtung = { modus: 'beleg', betrag: 90, naechte: null };
    const h = beleg('hotelrechnung', 103.5);
    expect(syncBelege(state, [h], [h]).uebernachtung?.betrag).toBe(103.5);
  });
});
