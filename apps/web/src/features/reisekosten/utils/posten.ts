import { eur } from './format';

import type { ComputeResult, ReisekostenState } from '@gruenerator/contracts';

export type Posten = { name: string; detail: string; betrag: string; beleg?: 'ok' | 'missing' };

/** Receipt state for a fahrt position that carries a belegVorhanden flag. */
function belegState(pos: { betrag: number; belegVorhanden: boolean } | null): Posten['beleg'] {
  if (!pos) return undefined;
  if (pos.belegVorhanden) return 'ok';
  return pos.betrag > 0 ? 'missing' : undefined;
}

export function buildPosten(state: ReisekostenState, computed: ComputeResult): Posten[] {
  const f = computed.fahrtkosten;
  const posten: Posten[] = [];
  if (state.fahrt.bahn)
    posten.push({
      name: 'Bahn',
      detail: '2. Klasse',
      betrag: eur(f.bahn),
      beleg: belegState(state.fahrt.bahn),
    });
  if (state.fahrt.oepnv)
    posten.push({
      name: 'ÖPNV',
      detail: 'Nahverkehr',
      betrag: eur(f.oepnv),
      beleg: belegState(state.fahrt.oepnv),
    });
  if (state.fahrt.kfz)
    posten.push({ name: 'Kfz', detail: `${state.fahrt.kfz.km} km`, betrag: eur(f.kfz) });
  if (state.fahrt.miete)
    posten.push({
      name: 'Mietwagen / Carsharing',
      detail: 'lt. Beleg',
      betrag: eur(f.miete),
      beleg: belegState(state.fahrt.miete),
    });
  if (state.fahrt.taxi)
    posten.push({
      name: 'Taxi',
      detail: state.fahrt.taxi.begruendung || 'Begründung fehlt',
      betrag: eur(f.taxi),
      beleg: belegState(state.fahrt.taxi),
    });
  if (state.fahrt.sonstiges)
    posten.push({
      name: 'Sonstiges',
      detail: state.fahrt.sonstiges.beschreibung || 'Beschreibung fehlt',
      betrag: eur(f.sonstiges),
    });
  if (computed.verpflegung.summe > 0)
    posten.push({
      name: 'Verpflegungspauschale',
      detail: `${computed.verpflegung.tage.length} Tag(e)`,
      betrag: eur(computed.verpflegung.summe),
    });
  if (computed.uebernachtung.summe > 0)
    posten.push({
      name: 'Übernachtung',
      detail: 'lt. Angabe',
      betrag: eur(computed.uebernachtung.summe),
    });
  if (!posten.length)
    posten.push({
      name: 'Noch keine Positionen',
      detail: 'Reisearten in Schritt 3 wählen',
      betrag: '–',
    });
  return posten;
}
