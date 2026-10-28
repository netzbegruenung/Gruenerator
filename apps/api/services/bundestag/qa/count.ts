/**
 * Zählmodus des Bundestag-Q&A: exakte Zahlen aus DIPs `numFound`, ohne ein
 * Dokument zu lesen. Gezählt werden DRUCKSACHEN (`/drucksache`, nur Bundestag);
 * sobald ein Filter nur am Vorgang existiert (Deskriptor, Beratungsstand),
 * werden VORGÄNGE gezählt. Die Einheit steht im Ergebnis, damit die Antwort
 * sie nennen kann — „21 Kleine Anfragen" und „21 Vorgänge" sind verschiedene Zahlen.
 *
 * Gruppiert wird mit einer Abfrage je Gruppenwert (DIP kennt kein Group-by).
 * Obergrenze: `MAX_COUNT_CALLS` Abfragen je Aufruf; der Takt bleibt Sache des Clients.
 */
import {
  bundestagDrucksachetypSchema,
  bundestagUrheberSchema,
  type BundestagFilter,
  type BundestagGruppieren,
} from '@gruenerator/contracts';

import { type DipParams } from '../dip/dipClient.js';

import { type FindDip } from './find.js';

export type CountGroupBy = BundestagGruppieren;
export const MAX_COUNT_CALLS = 25;
const MAX_MONTHS = 24;
const DEFAULT_MONTHS = 12;
const CURRENT_WAHLPERIODE = 21;

export interface CountRow {
  label: string;
  n: number;
}

export interface CountResult {
  einheit: 'Drucksachen' | 'Vorgänge';
  gesamt: number;
  /** `null`, wenn nicht gruppiert wurde (oder die Gruppierung nicht möglich war). */
  gruppen: CountRow[] | null;
  gruppiertNach: CountGroupBy | null;
  /** Die tatsächlich angewandten Filter (mit Vorbelegungen). */
  filters: BundestagFilter;
  notes: string[];
  aufrufe: number;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

interface Month {
  y: number;
  m: number;
}

/** Monate von `von` bis `bis` (ISO-Daten), aufsteigend. */
function monthsBetween(von: string, bis: string): Month[] {
  const out: Month[] = [];
  let y = Number(von.slice(0, 4));
  let m = Number(von.slice(5, 7));
  const endY = Number(bis.slice(0, 4));
  const endM = Number(bis.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ y, m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function params(
  viaVorgang: boolean,
  f: BundestagFilter,
  extra: { urheber?: string; typ?: string; von?: string; bis?: string } = {}
): DipParams {
  const p: DipParams = { 'f.zuordnung': 'BT' };
  if (f.wahlperiode?.length) p['f.wahlperiode'] = f.wahlperiode;
  const von = extra.von ?? f.datumVon;
  const bis = extra.bis ?? f.datumBis;
  if (von) p['f.datum.start'] = von;
  if (bis) p['f.datum.end'] = bis;
  if (f.titel) p['f.titel'] = f.titel;
  const urheber = extra.urheber ? [extra.urheber] : f.urheber;
  if (viaVorgang) {
    if (urheber?.length) p['f.initiative'] = urheber;
    if (f.deskriptor?.length) p['f.deskriptor'] = f.deskriptor;
    if (f.beratungsstand?.length) p['f.beratungsstand'] = f.beratungsstand;
  } else {
    if (urheber?.length) p['f.urheber'] = urheber;
    const typ = extra.typ ? [extra.typ] : f.drucksachetyp;
    if (typ?.length) p['f.drucksachetyp'] = typ;
  }
  return p;
}

export async function countBundestag({
  filters,
  gruppieren,
  dip,
  today = new Date(),
}: {
  filters: BundestagFilter;
  gruppieren?: CountGroupBy | undefined;
  dip: FindDip;
  today?: Date;
}): Promise<CountResult> {
  const notes: string[] = [];
  const f: BundestagFilter = { ...filters };
  const viaVorgang = (f.deskriptor?.length ?? 0) > 0 || (f.beratungsstand?.length ?? 0) > 0;
  const einheit = viaVorgang ? 'Vorgänge' : 'Drucksachen';
  const endpoint = viaVorgang ? 'vorgang' : 'drucksache';
  if (viaVorgang) {
    notes.push(
      'Deskriptor bzw. Beratungsstand gibt es nur am Vorgang: gezählt werden Vorgänge, nicht Drucksachen.'
    );
    if (f.drucksachetyp?.length) {
      notes.push(
        'Der Drucksachentyp lässt sich bei Vorgängen nicht eingrenzen und wurde ignoriert.'
      );
      delete f.drucksachetyp;
    }
  }

  let calls = 0;
  const count = async (p: DipParams): Promise<number> => {
    calls++;
    return (await dip.list(endpoint, p)).numFound;
  };
  // DIP verknüpft wiederholte `f.drucksachetyp`/`f.urheber` mit UND (gemessen 28.10.2026:
  // zwei Typen liefern 0). Mehrere Werte werden deshalb einzeln gezählt und addiert.
  const typVals: (string | undefined)[] =
    !viaVorgang && (f.drucksachetyp?.length ?? 0) > 1 ? f.drucksachetyp! : [undefined];
  const urhVals: (string | undefined)[] = (f.urheber?.length ?? 0) > 1 ? f.urheber! : [undefined];
  const countFor = async (
    extra: { urheber?: string; typ?: string; von?: string; bis?: string } = {}
  ): Promise<number> => {
    let sum = 0;
    for (const t of extra.typ ? [extra.typ] : typVals) {
      for (const u of extra.urheber ? [extra.urheber] : urhVals) {
        sum += await count(
          params(viaVorgang, f, {
            ...extra,
            ...(t ? { typ: t } : {}),
            ...(u ? { urheber: u } : {}),
          })
        );
      }
    }
    return sum;
  };

  let groupBy = gruppieren ?? null;
  if (groupBy === 'typ' && viaVorgang) {
    notes.push('Nach Typ lässt sich bei Vorgängen nicht gruppieren; es gibt nur die Gesamtzahl.');
    groupBy = null;
  }

  // Monate: ohne Zeitraum die letzten zwölf, und ohne Wahlperiode keine Vorbelegung
  // (der Zeitraum trägt allein).
  let months: Month[] = [];
  if (groupBy === 'monat') {
    const endM: Month = { y: today.getUTCFullYear(), m: today.getUTCMonth() + 1 };
    if (!f.datumVon && !f.datumBis) {
      const idx = endM.y * 12 + endM.m - 1 - (DEFAULT_MONTHS - 1);
      f.datumVon = `${Math.floor(idx / 12)}-${p2((idx % 12) + 1)}-01`;
      notes.push(`Kein Zeitraum genannt, gezählt wurden die letzten ${DEFAULT_MONTHS} Monate.`);
    }
    f.datumBis ??= `${endM.y}-${p2(endM.m)}-${p2(lastDay(endM.y, endM.m))}`;
    f.datumVon ??= `${f.datumBis.slice(0, 4)}-01-01`;
    months = monthsBetween(f.datumVon, f.datumBis);
    if (months.length > MAX_MONTHS) {
      months = months.slice(-MAX_MONTHS);
      notes.push(
        `Zeitraum länger als ${MAX_MONTHS} Monate: gezählt wurden die letzten ${MAX_MONTHS}.`
      );
      f.datumVon = `${months[0]!.y}-${p2(months[0]!.m)}-01`;
    }
  } else if (!f.wahlperiode?.length && !f.datumVon && !f.datumBis) {
    f.wahlperiode = [CURRENT_WAHLPERIODE];
    notes.push(`Keine Wahlperiode genannt, angenommen wurde die ${CURRENT_WAHLPERIODE}.`);
  }

  const mult = typVals.length * urhVals.length;
  if (mult > 1) {
    notes.push(
      'Mehrere Typen bzw. Urheber wurden einzeln gezählt und addiert; ein Dokument mit mehreren Urhebern zählt mehrfach.'
    );
  }
  const groupCount =
    groupBy === 'fraktion'
      ? (f.urheber?.length ?? bundestagUrheberSchema.options.length)
      : groupBy === 'typ'
        ? (f.drucksachetyp?.length ?? bundestagDrucksachetypSchema.options.length)
        : months.length;
  const perGroup =
    groupBy === 'fraktion' ? typVals.length : groupBy === 'typ' ? urhVals.length : mult;
  if (groupBy && mult + groupCount * perGroup > MAX_COUNT_CALLS) {
    notes.push(
      `Die Aufteilung hätte mehr als ${MAX_COUNT_CALLS} DIP-Abfragen gebraucht; es gibt nur die Gesamtzahl.`
    );
    groupBy = null;
  }

  const gesamt = await countFor();
  if (!groupBy) {
    return {
      einheit,
      gesamt,
      gruppen: null,
      gruppiertNach: null,
      filters: f,
      notes,
      aufrufe: calls,
    };
  }

  let gruppen: CountRow[];
  if (groupBy === 'fraktion') {
    const values = f.urheber?.length ? f.urheber : [...bundestagUrheberSchema.options];
    gruppen = [];
    for (const u of values) gruppen.push({ label: u, n: await countFor({ urheber: u }) });
  } else if (groupBy === 'typ') {
    const values = f.drucksachetyp?.length
      ? f.drucksachetyp
      : [...bundestagDrucksachetypSchema.options];
    gruppen = [];
    for (const t of values) gruppen.push({ label: t, n: await countFor({ typ: t }) });
  } else {
    gruppen = [];
    for (const { y, m } of months) {
      const von = `${y}-${p2(m)}-01`;
      const bis = `${y}-${p2(m)}-${p2(lastDay(y, m))}`;
      gruppen.push({
        label: `${MONTH_NAMES[m - 1]} ${y}`,
        n: await countFor({ von, bis }),
      });
    }
  }
  const summe = gruppen.reduce((n, g) => n + g.n, 0);
  if (groupBy === 'fraktion' && !f.urheber?.length) {
    notes.push(
      'Fraktionen sind Urheber: gemeinsame Drucksachen mehrerer Urheber und Dokumente der Bundesregierung zählen ggf. in mehreren Zeilen bzw. in keiner.'
    );
  } else if (summe !== gesamt) {
    notes.push(
      `Die Gruppensumme (${summe}) weicht von der Gesamtzahl (${gesamt}) ab (Mehrfachzuordnung oder Rundung durch DIP).`
    );
  }
  return { einheit, gesamt, gruppen, gruppiertNach: groupBy, filters: f, notes, aufrufe: calls };
}

/** Kompakte Tabelle für das Modell und die Quellenliste. */
export function formatCount(r: CountResult): string {
  const kopf = `${r.gesamt} ${r.einheit} (DIP-Trefferzahl, Bundestag)`;
  if (!r.gruppen) return kopf;
  const zeilen = r.gruppen.map((g) => `| ${g.label} | ${g.n} |`);
  return [kopf, '', `| ${r.gruppiertNach} | ${r.einheit} |`, '|---|---|', ...zeilen].join('\n');
}
