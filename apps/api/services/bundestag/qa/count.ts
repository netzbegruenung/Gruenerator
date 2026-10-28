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
/** Beginn und Ende der Wahlperioden (konstituierende Sitzung bis Tag vor der nächsten). */
const WAHLPERIODE_RANGE: Record<number, { von: string; bis: string | null }> = {
  19: { von: '2017-10-24', bis: '2021-10-25' },
  20: { von: '2021-10-26', bis: '2025-03-24' },
  21: { von: '2025-03-25', bis: null },
};

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

/** Das Berliner Kalenderdatum (ISO) zu einem Zeitpunkt; um Mitternacht UTC ist es dort schon der Folgetag. */
function berlinDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d);
}

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
  gruppieren?: CountGroupBy;
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
  const urhVals: (string | undefined)[] = (f.urheber?.length ?? 0) > 1 ? f.urheber! : [undefined];
  const typAll: (string | undefined)[] =
    !viaVorgang && (f.drucksachetyp?.length ?? 0) > 1 ? f.drucksachetyp! : [undefined];
  // Die Summe läuft Typ × Urheber nacheinander durch den getakteten Client: ohne Deckel
  // wären es bis zu 10 × 7 Abfragen. Zuerst fallen die hinteren Typen weg, und die Notiz nennt sie.
  const typVals = typAll.slice(0, Math.max(1, Math.floor(MAX_COUNT_CALLS / urhVals.length)));
  if (typVals.length < typAll.length) {
    notes.push(
      `Mehr als ${MAX_COUNT_CALLS} DIP-Abfragen wären nötig gewesen; nicht gezählt wurden: ${typAll
        .slice(typVals.length)
        .join(', ')}. Die Gesamtzahl ist unvollständig.`
    );
  }
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
    const heute = berlinDate(today);
    const endM: Month = { y: Number(heute.slice(0, 4)), m: Number(heute.slice(5, 7)) };
    const ranges = (f.wahlperiode ?? []).map((w) => WAHLPERIODE_RANGE[w]);
    if (!f.datumVon && !f.datumBis && ranges.length > 0 && ranges.every((r) => r != null)) {
      // „in dieser Wahlperiode“ meint die ganze Wahlperiode, nicht ein Jahr davon.
      const sorted = ranges.map((r) => r!);
      f.datumVon = sorted.map((r) => r.von).sort()[0]!;
      const ends = sorted.map((r) => r.bis);
      if (ends.every((e) => e != null)) f.datumBis = ends.sort().at(-1)!;
      notes.push(
        `Kein Zeitraum genannt, gezählt wurde die Wahlperiode ${f.wahlperiode!.join('/')} ab ${f.datumVon}.`
      );
    } else if (!f.datumVon && !f.datumBis) {
      const idx = endM.y * 12 + endM.m - 1 - (DEFAULT_MONTHS - 1);
      f.datumVon = `${Math.floor(idx / 12)}-${p2((idx % 12) + 1)}-01`;
      notes.push(`Kein Zeitraum genannt, gezählt wurden die letzten ${DEFAULT_MONTHS} Monate.`);
    }
    // Das Fenster endet heute, nicht am Monatsende: „bis 31.10.“ am 28.10. wäre eine falsche Angabe.
    f.datumBis ??= heute;
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
  const einheit = einheitLabel(r);
  const fenster = [r.filters.datumVon, r.filters.datumBis].some(Boolean)
    ? `, Zeitraum ${r.filters.datumVon ? deDate(r.filters.datumVon) : 'offen'} bis ${r.filters.datumBis ? deDate(r.filters.datumBis) : 'offen'}`
    : r.filters.wahlperiode?.length
      ? `, Wahlperiode ${r.filters.wahlperiode.join('/')}`
      : '';
  // Die Filter gehören in die Quelle: ohne sie liest der Schreiber eine nach Urheber
  // gefilterte Zahl als Gesamtzahl (live 28.10.2026: „wie viele davon von den Grünen,
  // geht aus den Daten nicht hervor" — bei einer Zählung NUR der grünen Anfragen).
  const gefiltert = [
    r.filters.urheber?.length ? `Urheber: ${r.filters.urheber.join(' oder ')}` : '',
    r.filters.beratungsstand?.length ? `Stand: ${r.filters.beratungsstand.join(' oder ')}` : '',
    r.filters.deskriptor?.length ? `Schlagwort: ${r.filters.deskriptor.join(' und ')}` : '',
    r.filters.titel ? `Titel enthält „${r.filters.titel}“` : '',
  ].filter(Boolean);
  const filterText = gefiltert.length ? `; nur ${gefiltert.join('; ')}` : '';
  const kopf = `${r.gesamt} ${einheit} (DIP-Trefferzahl, Bundestag${fenster}${filterText})`;
  if (!r.gruppen) return kopf;
  const zeilen = r.gruppen.map((g) => `| ${g.label} | ${g.n} |`);
  return [kopf, '', `| ${r.gruppiertNach} | ${einheit} |`, '|---|---|', ...zeilen].join('\n');
}

const deDate = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Plural eines gefilterten Drucksachentyps; ohne Typfilter bleibt es bei der Einheit. */
const TYP_PLURAL: Record<string, string> = {
  Gesetzentwurf: 'Gesetzentwürfe',
  Antrag: 'Anträge',
  'Kleine Anfrage': 'Kleine Anfragen',
  'Große Anfrage': 'Große Anfragen',
  Antwort: 'Antworten',
  'Beschlussempfehlung und Bericht': 'Beschlussempfehlungen und Berichte',
  Unterrichtung: 'Unterrichtungen',
  Entschließungsantrag: 'Entschließungsanträge',
  Änderungsantrag: 'Änderungsanträge',
  Bericht: 'Berichte',
};

export function einheitLabel(r: Pick<CountResult, 'einheit' | 'filters'>): string {
  const typen = r.einheit === 'Drucksachen' ? (r.filters.drucksachetyp ?? []) : [];
  return typen.length > 0 ? typen.map((t) => TYP_PLURAL[t] ?? t).join(' und ') : r.einheit;
}
