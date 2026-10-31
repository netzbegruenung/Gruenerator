/**
 * Refs → Kandidaten für den Nationalrat, aus denselben gecachten Listen wie
 * `find` (eine Abfrage je Gesetzgebungsperiode, danach aus dem Speicher).
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import {
  gegenstandToCandidate,
  gpRoman,
  parseNationalratRef,
  protokollToCandidate,
} from './documents.js';
import { type NationalratApi } from './filterApi.js';

/** Unbekannte Refs fallen still weg; der Aufrufer sieht an der Länge, was fehlt. */
export async function resolveNationalratRefs(
  refs: readonly string[],
  api: NationalratApi
): Promise<BundestagCandidate[]> {
  const found = new Map<string, BundestagCandidate>();
  const unique = [...new Set(refs)];
  const parsed = unique.flatMap((ref) => {
    const p = parseNationalratRef(ref);
    return p ? [{ ref, ...p }] : [];
  });
  for (const gp of new Set(parsed.map((p) => p.gp))) {
    const wanted = new Set(parsed.filter((p) => p.gp === gp).map((p) => p.ref));
    const rows = parsed.some((p) => p.gp === gp && p.ityp !== 'NRSITZ')
      ? await api.gegenstaende(gpRoman(gp))
      : [];
    for (const r of rows) {
      const c = gegenstandToCandidate(r);
      if (c && wanted.has(c.ref)) found.set(c.ref, c);
    }
    const sitzungen = parsed.some((p) => p.gp === gp && p.ityp === 'NRSITZ')
      ? await api.protokolle(gpRoman(gp))
      : [];
    for (const r of sitzungen) {
      const c = protokollToCandidate(r, gp);
      if (c && wanted.has(c.ref)) found.set(c.ref, c);
    }
  }
  return unique.flatMap((ref) => found.get(ref) ?? []);
}
