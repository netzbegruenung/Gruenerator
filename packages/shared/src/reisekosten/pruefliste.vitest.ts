import { type BelegKategorie, type BelegMeta } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { betragAusBelegen, sortBelegeNachFormular } from './belegKategorien.js';
import { emptyReisekostenState } from './emptyState.js';
import { pruefliste } from './pruefliste.js';

function beleg(
  kategorie: BelegKategorie,
  betrag: number | null = null,
  id: string = kategorie
): BelegMeta {
  return {
    id,
    dateiname: `${id}.pdf`,
    mimeType: 'application/pdf',
    groesse: 1000,
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

describe('pruefliste', () => {
  it('asks for the route printout of a car trip until one is uploaded', () => {
    const state = emptyReisekostenState();
    state.fahrt.kfz = {
      km: 300,
      fahrzeug: 'pkw',
      routenplanerVorhanden: false,
      dbFlexpreis: null,
    };
    expect(pruefliste(state, []).find((p) => p.id === 'kfz-routenplaner')?.status).toBe('fehlt');
    expect(
      pruefliste(state, [beleg('routenplaner')]).find((p) => p.id === 'kfz-routenplaner')?.status
    ).toBe('ok');
  });

  it('requires invoice, Vorstandsbeschluss and route for a rental car', () => {
    const state = emptyReisekostenState();
    state.fahrt.miete = { betrag: 120, dbFlexpreis: null, belegVorhanden: true };
    const ids = pruefliste(state, [beleg('mietwagenrechnung', 120)])
      .filter((p) => p.status === 'fehlt')
      .map((p) => p.id);
    expect(ids).toEqual(['miete-beschluss', 'miete-routenplaner']);
  });

  it('notes when the entered amount differs from the belege', () => {
    const state = emptyReisekostenState();
    state.fahrt.bahn = { betrag: 80, belegVorhanden: true };
    const item = pruefliste(state, [beleg('db_ticket', 87.4)]).find(
      (p) => p.id === 'bahn-abweichung'
    );
    expect(item?.detail).toBe('Belege: 87,40 €, eingetragen: 80,00 €.');
  });

  it('asks nothing for lines that are empty', () => {
    expect(pruefliste(emptyReisekostenState(), [])).toEqual([]);
  });
});

describe('betragAusBelegen', () => {
  it('does not add a ticket on top of the invoice for the same journey', () => {
    const belege = [beleg('db_ticket', 87.4, 't'), beleg('db_rechnung', 87.4, 'r')];
    expect(betragAusBelegen(belege, 'bahn')).toBe(87.4);
  });

  it('ignores evidence documents that carry no reimbursable amount', () => {
    expect(betragAusBelegen([beleg('deutschlandticket', 58)], 'oepnv')).toBeNull();
  });
});

describe('sortBelegeNachFormular', () => {
  it('orders belege like the form lines', () => {
    const sorted = sortBelegeNachFormular([
      beleg('hotelrechnung'),
      beleg('taxiquittung'),
      beleg('db_ticket'),
    ]);
    expect(sorted.map((b) => b.kategorie)).toEqual(['db_ticket', 'taxiquittung', 'hotelrechnung']);
  });
});

describe('pruefliste – hotel invoice vs. chosen Übernachtung', () => {
  it('hints when an invoice is uploaded but the stay is marked as paid by the Verband', () => {
    const state = emptyReisekostenState();
    state.uebernachtung = { modus: 'lv_bezahlt', betrag: null, naechte: null };
    const item = pruefliste(state, [beleg('hotelrechnung', 103.5)]).find(
      (p) => p.id === 'hotel-modus'
    );
    expect(item?.status).toBe('hinweis');
  });
});
