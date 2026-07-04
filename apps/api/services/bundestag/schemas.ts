/**
 * Zod schemas for the Bundestag MCP server (DIP API + semantic search layer).
 *
 * Two layers, mirroring `../api-clients/schemas/abgeordnetenwatch.ts`:
 *  - RAW schemas model the MCP tool results. They are lenient — only consumed
 *    fields are declared and almost everything is optional/nullable, so
 *    upstream shape drift degrades gracefully instead of throwing.
 *  - DTO schemas are the trimmed, LLM-safe shapes that leave the client and
 *    are cached in Redis. Speeches arrive as full plenary text (3–4k chars
 *    each) and abstracts carry HTML entities — trimming/cleaning happens at
 *    the client boundary so oversized or dirty payloads never reach the LLM.
 */
import { z } from 'zod';

// ── Raw MCP tool results (only consumed fields; tolerate anything else) ─────
// `error`/`message` model the server's in-band failure payload (e.g. "Qdrant
// vector database not available") — callers must treat that as an error, not
// as an empty result set.
export const rawResultsEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    results: z.array(item).optional(),
    documents: z.array(item).optional(),
    totalResults: z.number().optional(),
    error: z.boolean().optional(),
    message: z.string().optional(),
  });

/** Scores come back as strings (e.g. "0.860") — coerce, tolerate numbers. */
const rawScore = z.union([z.string(), z.number()]).nullish();

export const rawDrucksacheSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  titel: z.string().nullish(),
  dokumentnummer: z.string().nullish(),
  drucksachetyp: z.string().nullish(),
  wahlperiode: z.number().nullish(),
  datum: z.string().nullish(),
  urheber: z.array(z.union([z.string(), z.object({ titel: z.string().nullish() })])).nullish(),
  fundstelle: z.object({ pdf_url: z.string().nullish() }).nullish(),
});

export const rawSpeechSchema = z.object({
  score: rawScore,
  speaker: z.string().nullish(),
  speakerParty: z.string().nullish(),
  text: z.string().nullish(),
  protokollId: z.union([z.string(), z.number()]).nullish(),
  dokumentnummer: z.string().nullish(),
  datum: z.string().nullish(),
  wahlperiode: z.number().nullish(),
  herausgeber: z.string().nullish(),
  topTitle: z.string().nullish(),
});

export const rawSemanticHitSchema = z.object({
  score: rawScore,
  docType: z.string().nullish(),
  docId: z.union([z.string(), z.number()]).nullish(),
  entityType: z.string().nullish(),
  title: z.string().nullish(),
  abstract: z.string().nullish(),
  dokumentnummer: z.string().nullish(),
  date: z.string().nullish(),
  wahlperiode: z.number().nullish(),
});

export const rawPersonSchema = z.object({
  id: z.union([z.string(), z.number()]),
  vorname: z.string().nullish(),
  nachname: z.string().nullish(),
  titel: z.string().nullish(),
  fraktion: z.union([z.string(), z.array(z.string())]).nullish(),
  wahlperiode: z.number().nullish(),
});

export const rawAktivitaetSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  aktivitaetsart: z.string().nullish(),
  titel: z.string().nullish(),
  datum: z.string().nullish(),
  wahlperiode: z.number().nullish(),
  dokumentnummer: z.string().nullish(),
});

export const rawVorgangSchema = z.object({
  id: z.union([z.string(), z.number()]),
  titel: z.string().nullish(),
  vorgangstyp: z.string().nullish(),
  beratungsstand: z.string().nullish(),
  datum: z.string().nullish(),
});

// ── Trimmed DTOs (leave the client; cached; source of truth for TS types) ───
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

// ── Cleaning helpers ─────────────────────────────────────────────────────────
const NAMED_ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&sect;': '§',
  '&auml;': 'ä',
  '&ouml;': 'ö',
  '&uuml;': 'ü',
  '&Auml;': 'Ä',
  '&Ouml;': 'Ö',
  '&Uuml;': 'Ü',
  '&szlig;': 'ß',
};

/**
 * DIP abstracts embed (sometimes double-encoded) HTML entities and tags.
 * Decode entities first so `&lt;br/&gt;` becomes a strippable tag, then strip
 * tags, collapse whitespace and truncate.
 */
export function cleanDipText(html: string, max: number): string {
  let text = html.replace(/&amp;/g, '&');
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    text = text.split(entity).join(char);
  }
  text = text
    .replace(/&#\d+;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function parseScore(score: string | number | null | undefined): number {
  if (typeof score === 'number') return Number.isFinite(score) ? score : 0;
  if (typeof score === 'string') return Number.parseFloat(score) || 0;
  return 0;
}
