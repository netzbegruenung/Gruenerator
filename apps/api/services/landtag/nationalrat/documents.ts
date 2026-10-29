/**
 * Zeilen der Filter-API → Kandidaten der Lese-Maschinerie (`BundestagCandidate`
 * ist die gemeinsame Form von find und read).
 *
 * Ref: `NR 28/I123` = Gesetzgebungsperiode (arabisch, die API spricht römisch) /
 * Gegenstandstyp (`ITYP`) + Nummer (`INR`). Nur die Typen aus `READABLE_ITYP`
 * werden je zu Kandidaten — das ist die Lizenzgrenze aus #5114 an der einen
 * Stelle, durch die jeder Kandidat geht.
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import { PARLAMENT_BASE, type NrRow } from './filterApi.js';

/**
 * Beilagen (`I`: Regierungsvorlagen, Ausschussberichte), selbständige (`A`) und
 * unselbständige (`UEA`) Anträge, Abänderungsanträge (`AA`), Sitzungsprotokolle.
 * NICHT: `J` (Schriftliche Anfrage), `AB` (Beantwortung), `M` (Mündliche Anfrage).
 */
export const READABLE_ITYP = ['I', 'A', 'UEA', 'AA', 'NRSITZ'] as const;
type ReadableItyp = (typeof READABLE_ITYP)[number];

export const NR_REF_RE = /^NR (\d{1,2})\/(I|A|UEA|AA|NRSITZ)(\d{1,5})$/;

const ROMAN: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** 28 → „XXVIII" (die Gesetzgebungsperioden reichen nicht über 39). */
export function gpRoman(n: number): string {
  let out = '';
  for (const [value, sign] of ROMAN) {
    while (n >= value) {
      out += sign;
      n -= value;
    }
  }
  return out;
}

export function gpNumber(roman: string): number {
  let n = 0;
  for (let i = 0; i < roman.length; i++) {
    const v = ROMAN.find(([, s]) => s === roman[i])?.[0] ?? 0;
    const next = ROMAN.find(([, s]) => s === roman[i + 1])?.[0] ?? 0;
    n += v < next ? -v : v;
  }
  return n;
}

export function parseNationalratRef(
  ref: string
): { gp: number; ityp: ReadableItyp; inr: number } | null {
  const m = NR_REF_RE.exec(ref);
  return m ? { gp: Number(m[1]), ityp: m[2] as ReadableItyp, inr: Number(m[3]) } : null;
}

const isReadable = (ityp: unknown): ityp is ReadableItyp =>
  (READABLE_ITYP as readonly unknown[]).includes(ityp);

/** Die Listen-API liefert JSON-Arrays als String („[\"GRÜNE\"]"). */
export function jsonList(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && !!x)
      : [];
  } catch {
    return [];
  }
}

const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

/** „20250924" → „2025-09-24" */
function isoFromSort(v: unknown): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(str(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Ein Gegenstand (Liste 101). `null` für alles außerhalb der Lizenzgrenze. */
export function gegenstandToCandidate(r: NrRow): BundestagCandidate | null {
  const gp = str(r.GP_CODE);
  const ityp = r.ITYP;
  const inr = str(r.INR);
  const hisUrl = str(r.HIS_URL);
  if (!gp || !inr || !hisUrl || !isReadable(ityp) || ityp === 'NRSITZ') return null;
  const schlagworte = [...jsonList(r.THEMEN), ...jsonList(r.SW)];
  return {
    ref: `NR ${gpNumber(gp)}/${ityp}${inr}`,
    dipId: hisUrl,
    kind: 'drucksache',
    dokumentnummer: str(r.Nummer) || `${inr}/${ityp}`,
    drucksachetyp: str(r.DOKTYP_LANG),
    titel: str(r.Betreff).trim(),
    datum: isoFromSort(r.DATUMSORT),
    urheber: jsonList(r.Fraktionen),
    pdfUrl: `${PARLAMENT_BASE}${hisUrl}`,
    vorgangId: null,
    vorgangTitel: null,
    abstract: schlagworte.length > 0 ? schlagworte.join(', ') : null,
    aktualisiert: null,
    beratung: null,
  };
}

/** Der HTML-Link des Gesamtprotokolls; vorläufige Protokolle tragen noch keinen. */
export function protokollHtmlLink(r: NrRow): string | null {
  return /href="(\/dokument\/[^"]+\.html)"/.exec(str(r.Gesamtprotokoll))?.[1] ?? null;
}

/** Eine Nationalratssitzung (Liste 211). */
export function protokollToCandidate(r: NrRow, gp: number): BundestagCandidate | null {
  const uri = str(r.uri);
  const inr = str(r.inr);
  if (!uri || !inr) return null;
  return {
    ref: `NR ${gp}/NRSITZ${inr}`,
    dipId: uri,
    kind: 'drucksache',
    dokumentnummer: `${inr}. Sitzung (${gpRoman(gp)}. GP)`,
    drucksachetyp: 'Stenographisches Protokoll',
    titel: `${inr}. Sitzung des Nationalrates`,
    datum: str(r.datum2).slice(0, 10),
    urheber: [],
    pdfUrl: `${PARLAMENT_BASE}${uri}`,
    vorgangId: null,
    vorgangTitel: null,
    abstract: null,
    aktualisiert: null,
    beratung: null,
  };
}
