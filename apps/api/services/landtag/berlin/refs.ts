/**
 * Refs → Kandidaten für das Abgeordnetenhaus. Eine Abfrage je Wahlperiode:
 * `f.dokumentnummer` ist ODER, aber exakt — und PARDOK schreibt Drucksachen
 * unter 1000 vierstellig mit Nullen („0964"), darum gehen die Schreibweisen
 * mit (gemessen 28.10.2026: `964` → 0 Treffer, `0964` → 1).
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import { BERLIN_REF_RE, toCandidate } from './documents.js';
import { type PardokLister } from './pardokLive.js';

const DOKNR_PAGE = 50;

export function parseBerlinRef(ref: string): { wp: string; nr: string; anfrage: boolean } | null {
  const m = BERLIN_REF_RE.exec(ref);
  return m ? { wp: m[1]!, anfrage: m[2] === 'S', nr: m[3]! } : null;
}

/** Unbekannte Refs fallen still weg; der Aufrufer sieht an der Länge, was fehlt. */
export async function resolveBerlinRefs(
  refs: readonly string[],
  pardok: PardokLister
): Promise<BundestagCandidate[]> {
  const parsed = [...new Set(refs)].flatMap((ref) => {
    const p = parseBerlinRef(ref);
    return p ? [{ ref, ...p }] : [];
  });
  const byWp = new Map<string, typeof parsed>();
  for (const p of parsed) byWp.set(p.wp, [...(byWp.get(p.wp) ?? []), p]);

  const found = new Map<string, BundestagCandidate>();
  for (const [wp, group] of byWp) {
    for (let i = 0; i < group.length; i += DOKNR_PAGE) {
      const chunk = group.slice(i, i + DOKNR_PAGE);
      const nummern = [
        ...new Set(chunk.flatMap((p) => [p.nr, p.nr.padStart(4, '0'), p.nr.padStart(5, '0')])),
      ];
      const page = await pardok.list('drucksache', {
        'f.wahlperiode': wp,
        'f.dokumentnummer': nummern,
        limit: 200,
      });
      for (const r of page.documents) {
        const c = toCandidate(r);
        if (!c) continue;
        // Anfrage und Antwort teilen Ref und PDF; die Anfrage (mit fragender Person) gewinnt.
        const have = found.get(c.ref);
        if (!have || (have.drucksachetyp === 'Antwort' && c.drucksachetyp !== 'Antwort')) {
          found.set(c.ref, c);
        }
      }
    }
  }
  return [...new Set(refs)].flatMap((ref) => found.get(ref) ?? []);
}
