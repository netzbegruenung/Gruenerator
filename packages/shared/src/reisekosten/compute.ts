/**
 * Deterministic Reisekosten calculation. No AI — every amount, day and cap is
 * computed here so the totals are reproducible and audit-safe. Mirrors the
 * official NRW form (verified against its worked example: 325,13 → 270,58).
 */
import {
  type ComputeResult,
  type Fahrt,
  type Kfz,
  type ReisekostenState,
  type Uebernachtung,
  type VerpflegungAbzug,
  type VerpflegungTag,
} from '@gruenerator/contracts';

import { getRate, type RateConfig } from './rateConfig.js';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** Local calendar day (YYYY-MM-DD) of a datetime-local / ISO string. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive list of YYYY-MM-DD keys from startKey to endKey. */
function dateRange(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  // Construct at noon to sidestep DST edges.
  const cur = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  if (!isValidDate(cur) || !isValidDate(end) || cur > end) return [startKey];
  // Guard against pathological ranges.
  let guard = 0;
  while (cur <= end && guard < 366) {
    keys.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return keys;
}

function computeKfz(kfz: Kfz | null, rate: RateConfig): number {
  if (!kfz) return 0;
  const satz = kfz.fahrzeug === 'motorrad' ? rate.kmSatzMotorrad : rate.kmSatzPkw;
  // Above the km cap only the DB-Flexpreis is reimbursable (rule 1.3 / e).
  if (kfz.km > rate.kmObergrenze) return round2(kfz.dbFlexpreis ?? 0);
  return round2(kfz.km * satz);
}

function computeFahrtkosten(fahrt: Fahrt, rate: RateConfig): ComputeResult['fahrtkosten'] {
  const bahn = round2(fahrt.bahn?.betrag ?? 0);
  const oepnv = round2(fahrt.oepnv?.betrag ?? 0);
  const kfz = computeKfz(fahrt.kfz, rate);
  const miete = round2(fahrt.miete?.betrag ?? 0);
  const taxi = round2(fahrt.taxi?.betrag ?? 0);
  const sonstiges = round2(fahrt.sonstiges?.betrag ?? 0);
  return {
    bahn,
    oepnv,
    kfz,
    miete,
    taxi,
    sonstiges,
    summe: round2(bahn + oepnv + kfz + miete + taxi + sonstiges),
  };
}

function makeTag(
  datum: string,
  typ: VerpflegungTag['typ'],
  basis: number,
  abzuege: Map<string, VerpflegungAbzug>,
  rate: RateConfig,
): VerpflegungTag {
  const abz = abzuege.get(datum);
  let abzugRaw = 0;
  if (abz) {
    if (abz.fruehstueck) abzugRaw += rate.abzugFruehstueck;
    if (abz.mittagessen) abzugRaw += rate.abzugHauptmahlzeit;
    if (abz.abendessen) abzugRaw += rate.abzugHauptmahlzeit;
  }
  // Deduction is capped at the day's allowance (rule c).
  const abzug = Math.min(basis, round2(abzugRaw));
  return { datum, typ, basis, abzug, summe: round2(basis - abzug) };
}

/**
 * Derive the meal-allowance days. A trip counts as eintägig (incl. the
 * Mitternachtsregelung: a shortly-after-midnight return still belongs to the
 * departure day) when no overnight is claimed; otherwise Anreise/Zwischen/
 * Abreise days are laid out across the calendar span.
 */
export function computeVerpflegungDays(
  reisebeginn: string,
  rueckkehr: string,
  hasOvernight: boolean,
  abzuegeList: VerpflegungAbzug[],
  rate: RateConfig,
): VerpflegungTag[] {
  const beginn = new Date(reisebeginn);
  const ende = new Date(rueckkehr);
  if (!isValidDate(beginn) || !isValidDate(ende)) return [];

  const abzuege = new Map(abzuegeList.map((a) => [a.datum, a]));
  const startKey = dayKey(beginn);

  if (!hasOvernight) {
    const absenceHours = (ende.getTime() - beginn.getTime()) / 3_600_000;
    const basis = absenceHours > rate.eintaegigMinStunden ? rate.verpflegungEintaegig : 0;
    return [makeTag(startKey, 'eintaegig', basis, abzuege, rate)];
  }

  const keys = dateRange(startKey, dayKey(ende));
  return keys.map((key, i) => {
    let typ: VerpflegungTag['typ'];
    let basis: number;
    if (i === keys.length - 1) {
      typ = 'abreise';
      basis = rate.verpflegungAnreiseAbreise;
    } else if (i === 0) {
      typ = 'anreise';
      basis = rate.verpflegungAnreiseAbreise;
    } else {
      typ = 'zwischen';
      basis = rate.verpflegungZwischentag;
    }
    return makeTag(key, typ, basis, abzuege, rate);
  });
}

function computeUebernachtung(u: Uebernachtung | null, rate: RateConfig): number {
  if (!u) return 0;
  if (u.modus === 'pauschal') return round2((u.naechte ?? 0) * rate.uebernachtungPauschale);
  if (u.modus === 'beleg') return round2(u.betrag ?? 0);
  // 'lv_bezahlt': the Landesverband pays directly, nothing is reimbursed to the traveller.
  return 0;
}

export function computeReisekosten(state: ReisekostenState): ComputeResult {
  const rate = getRate(state.rateKey);
  const fahrtkosten = computeFahrtkosten(state.fahrt, rate);

  const tage = computeVerpflegungDays(
    state.reise.reisebeginn,
    state.reise.rueckkehr,
    state.uebernachtung !== null,
    state.verpflegungAbzuege,
    rate,
  );
  const verpflegungSumme = round2(tage.reduce((acc, t) => acc + t.summe, 0));
  const uebernachtungSumme = computeUebernachtung(state.uebernachtung, rate);

  const gesamt = round2(fahrtkosten.summe + verpflegungSumme + uebernachtungSumme);
  const spende = round2(state.spende);
  return {
    fahrtkosten,
    verpflegung: { tage, summe: verpflegungSumme },
    uebernachtung: { summe: uebernachtungSumme },
    gesamt,
    spende,
    auszahlung: round2(gesamt - spende),
  };
}
