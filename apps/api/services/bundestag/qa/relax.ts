/**
 * Lockerungen für eine leere Bundestag-Suche: welche Variante der Filter
 * trifft etwas? Das Modell setzt Filter mit Zufall (vier Deskriptoren, die DIP
 * per UND verknüpft; ein Titel, der nur ganze Wörter trifft), und „Keine
 * Treffer, lockere einen Filter" ließ es raten, welchen. Hier wird je Variante
 * genau EIN Filter gelockert und bei DIP gezählt; das Werkzeug gibt die
 * Zahlen und die beste Variante als nächsten Aufruf zurück (#5445).
 *
 * Gezählt wird über `countBundestag`, also mit dessen Einheit: sobald ein
 * Deskriptor im Spiel ist, sind es Vorgänge (ohne Typ-Eingrenzung), sonst
 * Drucksachen. Die Zahl sagt „in dieser Richtung gibt es etwas", nicht exakt,
 * wie lang die Liste wird.
 */
import { type BundestagFilter } from '@gruenerator/contracts';

import { countBundestag, type CountResult } from './count.js';
import { type FindDip } from './find.js';

/** Höchstens so viele Varianten je leerer Suche; jede kostet eine bis wenige DIP-Abfragen. */
export const MAX_RELAXATIONS = 4;

export interface Relaxation {
  /** Was gelockert wurde, in Worten fürs Modell. */
  aenderung: string;
  /** Die vollständigen Filter der Variante. */
  filters: BundestagFilter;
  treffer: number;
  einheit: CountResult['einheit'];
}

function without(f: BundestagFilter, ...keys: (keyof BundestagFilter)[]): BundestagFilter {
  const out = { ...f };
  for (const k of keys) delete out[k];
  return out;
}

/** Die Varianten in Reihenfolge der Wahrscheinlichkeit, dass sie die Ursache sind. */
function variants(f: BundestagFilter): Omit<Relaxation, 'treffer' | 'einheit'>[] {
  const out: Omit<Relaxation, 'treffer' | 'einheit'>[] = [];
  if (f.titel && !f.deskriptor?.length) {
    out.push({
      aenderung: `Titel „${f.titel}" als Deskriptor statt als Titelfilter`,
      filters: { ...without(f, 'titel'), deskriptor: [f.titel] },
    });
  }
  if ((f.deskriptor?.length ?? 0) > 1) {
    for (const d of f.deskriptor!) {
      out.push({
        aenderung: `nur Deskriptor „${d}" (mehrere Deskriptoren müssen alle zugleich passen)`,
        filters: { ...f, deskriptor: [d] },
      });
    }
  }
  if (f.urheber?.length) out.push({ aenderung: 'ohne Urheber', filters: without(f, 'urheber') });
  if (f.datumVon || f.datumBis) {
    out.push({ aenderung: 'ohne Zeitraum', filters: without(f, 'datumVon', 'datumBis') });
  }
  return out.slice(0, MAX_RELAXATIONS);
}

/** Zählt die Lockerungen; eine Variante, deren Zählung scheitert, fällt still weg. */
export async function suggestRelaxations({
  filters,
  dip,
}: {
  filters: BundestagFilter;
  dip: FindDip;
}): Promise<Relaxation[]> {
  const counted = await Promise.all(
    variants(filters).map(async (v) => {
      try {
        const r = await countBundestag({ filters: v.filters, dip });
        // `v.filters`, nicht `r.filters`: die Zählung streicht am Vorgang den Typ, der
        // nächste Suchaufruf soll ihn aber behalten.
        return { ...v, treffer: r.gesamt, einheit: r.einheit };
      } catch {
        return null;
      }
    })
  );
  return counted.filter((r): r is Relaxation => r !== null);
}
