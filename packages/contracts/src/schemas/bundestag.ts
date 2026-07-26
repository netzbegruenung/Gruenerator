/**
 * Bundestag DIP wire shapes — the trimmed, LLM-safe DTOs produced by the
 * `apps/api` Bundestag MCP client. Canonical source of truth for the DTO
 * types; `apps/api` re-exports these (the RAW MCP schemas + cleaning helpers
 * stay client-side). Chat surfaces the results as standard SearchResults /
 * citations — there is no bespoke wire payload anymore.
 *
 * Data originates from the "Bundestag Wrapped" MCP (DIP API + semantic layer).
 */
import { z } from 'zod';

// ── Trimmed DTOs ─────────────────────────────────────────────────────────────
export const btDrucksacheSchema = z.object({
  id: z.string(),
  titel: z.string(),
  dokumentnummer: z.string(),
  drucksachetyp: z.string().nullable(),
  wahlperiode: z.number().nullable(),
  datum: z.string().nullable(),
  urheber: z.array(z.string()),
  pdfUrl: z.string().nullable(),
});
export type BtDrucksache = z.infer<typeof btDrucksacheSchema>;

export const btSpeechSchema = z.object({
  speaker: z.string(),
  party: z.string().nullable(),
  date: z.string().nullable(),
  /** Truncated at the client boundary — full speeches run 3–4k chars. */
  excerpt: z.string(),
  protokollNummer: z.string().nullable(),
  wahlperiode: z.number().nullable(),
  herausgeber: z.string().nullable(),
  topTitle: z.string().nullable(),
  score: z.number(),
});
export type BtSpeech = z.infer<typeof btSpeechSchema>;

export const btSemanticHitSchema = z.object({
  docType: z.string(),
  docId: z.string(),
  entityType: z.string().nullable(),
  title: z.string(),
  /** HTML-stripped, entity-decoded, capped at the client boundary. */
  abstract: z.string().nullable(),
  dokumentnummer: z.string().nullable(),
  date: z.string().nullable(),
  wahlperiode: z.number().nullable(),
  score: z.number(),
});
export type BtSemanticHit = z.infer<typeof btSemanticHitSchema>;

export const btPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  fraktion: z.string().nullable(),
  wahlperiode: z.number().nullable(),
});
export type BtPerson = z.infer<typeof btPersonSchema>;

export const btAktivitaetSchema = z.object({
  titel: z.string(),
  typ: z.string().nullable(),
  datum: z.string().nullable(),
  dokumentnummer: z.string().nullable(),
});
export type BtAktivitaet = z.infer<typeof btAktivitaetSchema>;

export const btVorgangSchema = z.object({
  id: z.string(),
  titel: z.string(),
  vorgangstyp: z.string().nullable(),
  beratungsstand: z.string().nullable(),
  datum: z.string().nullable(),
});
export type BtVorgang = z.infer<typeof btVorgangSchema>;

// ── Shared DIP link helpers (used by the backend SearchResult mapper) ─────────
/** DIP full-text search link — the never-404 fallback for any citation. */
export function dipSearchUrl(term: string): string {
  return `https://dip.bundestag.de/suche?term=${encodeURIComponent(term)}`;
}

/**
 * Plenary-protocol PDF on dserver.bundestag.de — only constructible for
 * Bundestag protocols with a canonical "wp/number" dokumentnummer; anything
 * else returns null so callers fall back to a DIP search link.
 */
export function btpProtokollPdfUrl(
  protokollNummer: string | null,
  herausgeber: string | null
): string | null {
  if (herausgeber !== 'BT' || !protokollNummer) return null;
  const m = protokollNummer.match(/^(\d{1,2})\/(\d{1,4})$/);
  if (!m) return null;
  const [, wp, nr] = m;
  if (!wp || !nr) return null;
  return `https://dserver.bundestag.de/btp/${wp}/${wp}${nr.padStart(3, '0')}.pdf`;
}
