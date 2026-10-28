/**
 * Zod-Schemata der Bundestags-Fragen (Plan, Antwort). Die ts-rest-Verträge
 * selbst stehen separat; hier liegen nur die Formen, aus denen alle Schichten
 * ihre Typen per `z.infer` ableiten.
 *
 * Leitsatz: `ref` ist der einzige Schlüssel eines Dokuments — Drucksache
 * („21/1234") oder Protokoll-Abschnitt („PlPr 21/45 S. 12-15"). Alles andere
 * (DIP-Id, Vorgang) ist Beiwerk. `null` heisst „DIP liefert es nicht".
 */
import { z } from 'zod';

export const bundestagDrucksachetypSchema = z.enum([
  'Gesetzentwurf',
  'Antrag',
  'Kleine Anfrage',
  'Große Anfrage',
  'Antwort',
  'Beschlussempfehlung und Bericht',
  'Unterrichtung',
  'Entschließungsantrag',
  'Änderungsantrag',
  'Bericht',
]);

export const bundestagUrheberSchema = z.enum([
  'Fraktion BÜNDNIS 90/DIE GRÜNEN',
  'Fraktion der CDU/CSU',
  'Fraktion der SPD',
  'Fraktion der AfD',
  'Fraktion DIE LINKE',
  'Fraktion der FDP',
  'Bundesregierung',
]);

/** Exakte DIP-Werte von `f.beratungsstand` (Vorgang), am 28.10.2026 mit Treffern in WP 20/21 geprüft. */
export const bundestagBeratungsstandSchema = z.enum([
  'Verkündet',
  'Angenommen',
  'Verabschiedet',
  'Bundesrat hat zugestimmt',
  'Abgelehnt',
  'Zurückgezogen',
  'Für erledigt erklärt',
  'Beschlussempfehlung liegt vor',
  'Überwiesen',
  'In der Beratung (Einzelheiten siehe Vorgangsablauf)',
  'Noch nicht beraten',
]);

export const bundestagRefSchema = z
  .string()
  .regex(/^(\d{1,2}\/\d{1,6}|PlPr \d{1,2}\/\d{1,4} S\. \d+-\d+)$/);

/** Woher der Text eines Dokuments stammt (`missing`: nirgends zu holen). */
export const bundestagTextSourceSchema = z.enum(['dip', 'pdf', 'protokoll', 'missing']);

/** Warum ein Dokument nicht gelesen wurde. */
export const bundestagReadSkippedSchema = z.enum(['budget', 'deadline', 'missing']);

export const bundestagAuftragSchema = z.enum(['frage', 'zusammenfassung']);

/** Chat-Werkzeug `bundestag`: Liste der Fundstellen oder exakte Zählung (additiv seit 28.10.2026). */
export const bundestagModusSchema = z.enum(['liste', 'zaehlen']);

/** Gruppierung der Zählung: eine DIP-Abfrage je Gruppenwert. */
export const bundestagGruppierenSchema = z.enum(['fraktion', 'monat', 'typ']);

export const bundestagFilterSchema = z.object({
  wahlperiode: z.array(z.number().int().min(1).max(30)).max(3).optional(),
  // Typ × Urheber wird als ODER in Einzelabfragen zerlegt (höchstens 8, siehe
  // MAX_OR_QUERIES in qa/find.ts). Darüber fragt find.ts nicht alles ab und
  // sagt das in einer Notiz — besser als ein abgelehnter Werkzeugaufruf.
  drucksachetyp: z.array(bundestagDrucksachetypSchema).max(4).optional(),
  urheber: z.array(bundestagUrheberSchema).max(4).optional(),
  beratungsstand: z.array(bundestagBeratungsstandSchema).max(11).optional(),
  datumVon: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  datumBis: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dokumentnummer: z
    .array(z.string().regex(/^\d{1,2}\/\d{1,6}$/))
    .max(10)
    .optional(),
  deskriptor: z.array(z.string().min(2).max(80)).max(4).optional(),
  titel: z.string().max(200).optional(),
  mitBeratung: z.boolean().optional(),
});

/**
 * Ein Schritt im Beratungsverlauf eines Vorgangs: eine Position mit
 * Beschlussfassung (Beratung, Durchgang) oder die Beschlussempfehlung.
 * `gremium` ist DIPs `zuordnung` — der Bundesrat gehört zum Verlauf dazu.
 * `fundstelle` ist das Dokument („Plenarprotokoll 21/62", „Drucksache 21/4371"),
 * die genaue Seite steht am Beschluss („7524B").
 */
export const bundestagVerlaufSchrittSchema = z.object({
  position: z.string(),
  gremium: z.enum(['BT', 'BR']).nullable(),
  datum: z.string(),
  fundstelle: z.string().nullable(),
  anfangsseite: z.number().int().nullable(),
  pdfUrl: z.string().nullable(),
  beschluesse: z.array(
    z.object({
      tenor: z.string(),
      seite: z.string().nullable(),
      /** Abstimmungsart und Mehrheit in Worten, wenn DIP sie nennt. */
      abstimmung: z.string().nullable(),
    })
  ),
});

/** Kompakter Beratungsverlauf eines Vorgangs samt Verkündung (BGBl), wenn es eine gibt. */
export const bundestagVerlaufSchema = z.object({
  schritte: z.array(bundestagVerlaufSchrittSchema),
  verkuendung: z
    .object({
      datum: z.string().nullable(),
      fundstelle: z.string(),
      pdfUrl: z.string().nullable(),
    })
    .nullable(),
});

/** Ein Treffer der Kandidatensuche, noch ungelesen. */
export const bundestagCandidateSchema = z.object({
  ref: bundestagRefSchema,
  dipId: z.string(),
  kind: z.enum(['drucksache', 'beratung']),
  dokumentnummer: z.string(),
  /** DIP kennt mehr Typen als unser Filter (z. B. „Beschluss"), daher freier String. */
  drucksachetyp: z.string(),
  titel: z.string(),
  datum: z.string(),
  urheber: z.array(z.string()),
  pdfUrl: z.string().nullable(),
  vorgangId: z.string().nullable(),
  vorgangTitel: z.string().nullable(),
  abstract: z.string().nullable(),
  aktualisiert: z.string().nullable(),
  beratung: z
    .object({
      xmlUrl: z.string(),
      anfangsseite: z.number().int(),
      endseite: z.number().int(),
    })
    .nullable(),
  /**
   * Beratungsverlauf des Vorgangs (additiv seit 28.10.2026). Fehlt bei
   * Treffern ohne Vorgang (Rückfall über die semantische Suche); alle
   * Kandidaten desselben Vorgangs tragen denselben Verlauf.
   */
  verlauf: bundestagVerlaufSchema.nullable().optional(),
});

export const bundestagPlanRequestSchema = z.object({
  question: z.string().min(3).max(1000),
  filters: bundestagFilterSchema.optional(),
});

export const bundestagPlanResponseSchema = z.object({
  filters: bundestagFilterSchema,
  keywords: z.array(z.string()),
  notes: z.array(z.string()),
  totals: z.object({ vorgaenge: z.number().int(), drucksachen: z.number().int() }),
  candidates: z.array(bundestagCandidateSchema),
});

export const bundestagAnswerRequestSchema = z.object({
  question: z.string().min(3).max(1000),
  filters: bundestagFilterSchema.optional(),
  refs: z.array(bundestagRefSchema).max(12).optional(),
  auftrag: bundestagAuftragSchema.optional(),
});

/** Eine belegte Aussage: `zitat` steht wörtlich im Quelltext, `method` sagt, wie sie gefunden wurde. */
export const bundestagPointSchema = z.object({
  aussage: z.string(),
  zitat: z.string(),
  method: z.enum(['exact', 'normalized', 'fuzzy']),
});

export const bundestagAnswerResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      n: z.number().int(),
      ref: bundestagRefSchema,
      drucksachetyp: z.string(),
      datum: z.string(),
      titel: z.string(),
      pdfUrl: z.string().nullable(),
      aussage: z.string(),
      zitat: z.string(),
    })
  ),
  documents: z.array(
    z.object({
      ref: bundestagRefSchema,
      drucksachetyp: z.string(),
      titel: z.string(),
      textSource: bundestagTextSourceSchema,
      relevant: z.boolean(),
      points: z.array(bundestagPointSchema),
      droppedPoints: z.number().int(),
      windowsRead: z.number().int(),
      windowsTotal: z.number().int(),
      skipped: bundestagReadSkippedSchema.nullable(),
    })
  ),
  filters: bundestagFilterSchema,
  notes: z.array(z.string()),
  stats: z.object({
    msTotal: z.number().int(),
    msRead: z.number().int(),
    charsRead: z.number().int(),
    pointsVerified: z.number().int(),
    pointsDropped: z.number().int(),
    invalidCitations: z.number().int(),
  }),
});

export const bundestagErrorSchema = z.object({ error: z.string() });

export type BundestagDrucksachetyp = z.infer<typeof bundestagDrucksachetypSchema>;
export type BundestagUrheber = z.infer<typeof bundestagUrheberSchema>;
export type BundestagRef = z.infer<typeof bundestagRefSchema>;
export type BundestagAuftrag = z.infer<typeof bundestagAuftragSchema>;
export type BundestagTextSource = z.infer<typeof bundestagTextSourceSchema>;
export type BundestagReadSkipped = z.infer<typeof bundestagReadSkippedSchema>;
export type BundestagModus = z.infer<typeof bundestagModusSchema>;
export type BundestagGruppieren = z.infer<typeof bundestagGruppierenSchema>;
export type BundestagFilter = z.infer<typeof bundestagFilterSchema>;
export type BundestagVerlaufSchritt = z.infer<typeof bundestagVerlaufSchrittSchema>;
export type BundestagVerlauf = z.infer<typeof bundestagVerlaufSchema>;
export type BundestagCandidate = z.infer<typeof bundestagCandidateSchema>;
export type BundestagPlanRequest = z.infer<typeof bundestagPlanRequestSchema>;
export type BundestagPlanResponse = z.infer<typeof bundestagPlanResponseSchema>;
export type BundestagAnswerRequest = z.infer<typeof bundestagAnswerRequestSchema>;
export type BundestagPoint = z.infer<typeof bundestagPointSchema>;
export type BundestagAnswerResponse = z.infer<typeof bundestagAnswerResponseSchema>;

function deDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

const GREMIUM_NAME = { BT: 'Bundestag', BR: 'Bundesrat' } as const;

/**
 * Der Verlauf als kurze Zeilen, für das Modell, die Karte im Chat und die
 * Testseite — eine Form an einer Stelle. Beispiel:
 * „3. Beratung (Bundestag) 05.03.2026: Annahme in Ausschussfassung — Plenarprotokoll 21/62 S. 7524B".
 * Mehrere Beschlüsse mit verschiedenen Seiten tragen die Seite je Beschluss.
 */
export function bundestagVerlaufLines(verlauf: BundestagVerlauf): string[] {
  const lines = verlauf.schritte.map((s) => {
    const head = `${s.position}${s.gremium ? ` (${GREMIUM_NAME[s.gremium]})` : ''}${s.datum ? ` ${deDate(s.datum)}` : ''}`;
    const seiten = [...new Set(s.beschluesse.map((b) => b.seite).filter(Boolean))];
    const eineSeite = seiten.length <= 1;
    const tenor = s.beschluesse
      .map((b) => {
        const extra = [b.abstimmung, !eineSeite && b.seite ? `S. ${b.seite}` : null]
          .filter(Boolean)
          .join(', ');
        return extra ? `${b.tenor} (${extra})` : b.tenor;
      })
      .join('; ');
    const seite = eineSeite
      ? (seiten[0] ?? (s.anfangsseite != null ? String(s.anfangsseite) : null))
      : null;
    const wo = s.fundstelle ? `${s.fundstelle}${seite ? ` S. ${seite}` : ''}` : null;
    return [tenor ? `${head}: ${tenor}` : head, wo].filter(Boolean).join(' — ');
  });
  const v = verlauf.verkuendung;
  if (v) lines.push(`Verkündet${v.datum ? ` ${deDate(v.datum)}` : ''}: ${v.fundstelle}`);
  return lines;
}
