/**
 * Vom Wort der Person zum gespeicherten Wert. Antragsteller*innen, Voten und
 * Tagesordnungspunkte stehen als exakte Schlüsselwörter im Index („KV Köln",
 * „Übernahme in modifizierter Fassung"); das Modell schreibt „Köln" oder
 * „modifiziert". Aufgelöst wird gegen die tatsächlich vorhandenen Werte (eine
 * Facette), nie gegen eine geratene Liste.
 */
import { type ConsultationRef } from '../scrapers/implementations/ParteitageScraper/antragsgruenClient.js';
import { parteitagLabelOf } from '../scrapers/implementations/ParteitageScraper/builders.js';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\bkreisverband\b/g, 'kv')
    .replace(/\bortsverband\b/g, 'ov')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const words = (s: string): string[] => normalize(s).split(' ').filter(Boolean);

/** Werte, die jedes Wort der Anfrage enthalten (als Wortanfang). Leere Anfrage: keine. */
export function matchValues(wanted: string, values: readonly string[]): string[] {
  const want = words(wanted);
  if (want.length === 0) return [];
  return values.filter((v) => {
    const have = words(v);
    return want.every((w) => have.some((h) => h.startsWith(w)));
  });
}

/** Kürzel ohne Gross-/Kleinschreibung und Trenner: „wp 06" = „WP-06", aber „WP6" ≠ „WP-06". */
export function sameKuerzel(a: string, b: string): boolean {
  return normalize(a).replace(/ /g, '') === normalize(b).replace(/ /g, '');
}

/**
 * Parteitage zu einer Nennung: `url_path` exakt („ldk26-02"), sonst müssen alle
 * Wörter in Kurztitel, Titel oder Jahr stehen („LDK Essen", „Essen 2026").
 */
export function matchConsultations(
  wanted: string,
  refs: readonly ConsultationRef[]
): ConsultationRef[] {
  const exact = refs.filter((r) => r.url_path.toLowerCase() === wanted.trim().toLowerCase());
  if (exact.length > 0) return exact;
  const want = words(wanted);
  if (want.length === 0) return [];
  return refs.filter((r) => {
    const have = words(`${parteitagLabelOf(r)} ${r.title} ${r.url_path}`);
    return want.every((w) => have.some((h) => h.startsWith(w)));
  });
}
