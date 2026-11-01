/**
 * PARDOK-Drucksache → Kandidat der Lese-Maschinerie (`BundestagCandidate` ist
 * die gemeinsame Form von find und read; ein eigener Typ liefe nur daneben her).
 *
 * Refs: `BE 19/3519` für Drucksachen, `BE 19/S27288` für Schriftliche Anfragen.
 * Die Anfragen haben eine eigene, deutlich längere Nummernreihe (27288 gegen 3519
 * im selben Wahlperiode) und teilen sie mit ihrer Antwort: Anfrage und Antwort
 * stehen als zwei Drucksachen (D-460271, D-460272) in derselben PDF
 * (`…/SchrAnfr/S19-27288.pdf`, am 28.10.2026 gelesen: beides drin). Das `S`
 * hält die Reihe von Drucksachen gleicher Nummer auseinander, und beide
 * Datensätze führen zu einem Ref und einem Lesevorgang.
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import { type PardokRecord } from '../../scrapers/implementations/LandtagBerlinScraper/pardokClient.js';

export const BERLIN_REF_PREFIX = 'BE';
export const PARDOK_PDF_HOST = 'pardok.parlament-berlin.de';

/** `BE 19/3519` | `BE 19/S27288` */
export const BERLIN_REF_RE = /^BE (\d{1,2})\/(S?)(\d{1,6})$/;

type Field = Record<string, string>;
const first = (r: PardokRecord, key: string): Field | undefined => {
  const v = r[key];
  return Array.isArray(v) ? v[0] : undefined;
};
const all = (r: PardokRecord, key: string): Field[] => {
  const v = r[key];
  return Array.isArray(v) ? v : [];
};

/** PARDOK führt Drucksachennummern vierstellig mit führenden Nullen („0964"), Anfragen unauffällig. */
const stripZeros = (nr: string) => nr.replace(/^0+(?=\d)/, '');

/** „2026.09.09" → „2026-09-09" */
function isoDate(datum: unknown): string {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(typeof datum === 'string' ? datum : '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Die Anfragen liegen unter /SchrAnfr/ (bzw. /KlAnfr/ in alten Wahlperioden), nie unter /DruckSachen/. */
export function isAnfrageRecord(pdfUrl: string | null, typ: string): boolean {
  return /\/(?:SchrAnfr|KlAnfr)\//.test(pdfUrl ?? '') || /anfrage$/i.test(typ);
}

export function berlinRef(wahlperiode: string, nummer: string, anfrage: boolean): string {
  return `${BERLIN_REF_PREFIX} ${wahlperiode}/${anfrage ? 'S' : ''}${stripZeros(nummer)}`;
}

export function toCandidate(r: PardokRecord): BundestagCandidate | null {
  const id = first(r, 'id')?.main;
  const nummer = first(r, 'dokumentnummer')?.main;
  const wp = first(r, 'wahlperiode')?.main;
  if (!id || !nummer || !wp) return null;
  const typ = first(r, 'drucksachentyp')?.main ?? '';
  const titel = first(r, 'titel');
  const pdfUrl = all(r, 'pdf_url')[0]?.main ?? null;
  const anfrage = isAnfrageRecord(pdfUrl, typ);
  const personen = all(r, 'urheber')
    .filter((u) => u.name)
    .map((u) => (u.fraktion ? `${u.name} (${u.fraktion})` : (u.name ?? '')));
  const koerper = all(r, 'urheber_koerperschaft')
    .map((k) => k.main)
    .filter((k): k is string => !!k);
  const aktualisiert = first(r, 'aktualisiert')?.D?.replace(/ /g, '-') ?? null;
  return {
    ref: berlinRef(wp, nummer, anfrage),
    dipId: id,
    kind: 'drucksache',
    dokumentnummer: `${wp}/${anfrage ? 'S' : ''}${stripZeros(nummer)}`,
    drucksachetyp: typ,
    titel: (titel?.t || titel?.main || '').trim(),
    datum: isoDate(r.datum),
    urheber: [...koerper, ...personen],
    pdfUrl,
    vorgangId: first(r, 'vorgangsbezug')?.main ?? null,
    vorgangTitel: null,
    // Das Schlagwort der Dokumentation (`titel.d`) ist das Beste, was die Liste über das Thema sagt.
    abstract: titel?.d?.trim() || null,
    aktualisiert,
    beratung: null,
  };
}

/** Anfrage und Antwort teilen Ref und PDF: pro Ref bleibt die Anfrage (früheres Datum, fragende Person). */
export function dedupeByRef(cands: readonly BundestagCandidate[]): BundestagCandidate[] {
  const byRef = new Map<string, BundestagCandidate>();
  for (const c of cands) {
    const have = byRef.get(c.ref);
    if (!have || (have.drucksachetyp === 'Antwort' && c.drucksachetyp !== 'Antwort')) {
      byRef.set(c.ref, c);
    }
  }
  return [...byRef.values()];
}

/** Person und Fraktion der fragenden Person (Anfragen tragen sie statt einer Körperschaft). */
export function personFraktion(r: PardokRecord): string[] {
  return all(r, 'urheber')
    .map((u) => u.fraktion)
    .filter((f): f is string => !!f);
}
