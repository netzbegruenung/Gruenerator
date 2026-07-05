/**
 * Zod schemas for the Reisekosten (travel-expense) Grünerator.
 *
 * Single source of truth for the form state, the belege extraction, the
 * validation findings and the PDF request. Types are derived via z.infer and
 * consumed by:
 *   - the deterministic engine in @gruenerator/shared/reisekosten
 *   - the ts-rest reisekostenContract (below in ../contracts)
 *   - the web wizard (react-hook-form + zodResolver)
 */
import { z } from 'zod';

// ── Enums (closed value sets) ────────────────────────────────────────────────

/** Rate-config key. NRW first; AT + other Landesverbände are added as config. */
export const rateKeySchema = z.enum(['de-DE/nrw']);

export const fahrzeugTypSchema = z.enum(['pkw', 'motorrad']);

export const uebernachtungModusSchema = z.enum(['lv_bezahlt', 'beleg', 'pauschal']);

export const belegTypSchema = z.enum(['bahn', 'oepnv', 'miete', 'hotel', 'sonstiges']);

export const reiseartSchema = z.enum(['bahn', 'oepnv', 'kfz', 'miete', 'taxi', 'sonstiges']);

export const findingLevelSchema = z.enum(['error', 'warn', 'info']);

// ── Form state ───────────────────────────────────────────────────────────────

export const stammdatenSchema = z.object({
  name: z.string(),
  funktion: z.string().optional(),
  strasse: z.string(),
  hausnr: z.string(),
  plz: z.string(),
  ort: z.string(),
  email: z.string(),
  telefon: z.string().optional(),
  /** IBAN/BIC are client-only (localStorage); only sent in the /pdf request. */
  iban: z.string(),
  bic: z.string().optional(),
});

export const reiseSchema = z.object({
  anlass: z.string(),
  ziel: z.string(),
  /** ISO datetime strings. */
  reisebeginn: z.string(),
  rueckkehr: z.string(),
  /** Reference date for the 3-month deadline; defaults to rueckkehr's date. */
  belegdatum: z.string().optional(),
});

const belegPositionSchema = z.object({
  betrag: z.number(),
  belegVorhanden: z.boolean(),
});

export const kfzSchema = z.object({
  km: z.number(),
  fahrzeug: fahrzeugTypSchema,
  routenplanerVorhanden: z.boolean(),
  /** Required (and used as the reimbursable amount) once km > kmObergrenze. */
  dbFlexpreis: z.number().nullable(),
});

export const mieteSchema = z.object({
  betrag: z.number(),
  dbFlexpreis: z.number().nullable(),
  belegVorhanden: z.boolean(),
});

export const fahrtSchema = z.object({
  bahn: belegPositionSchema.nullable(),
  oepnv: belegPositionSchema.nullable(),
  kfz: kfzSchema.nullable(),
  miete: mieteSchema.nullable(),
  taxi: z.object({ betrag: z.number(), begruendung: z.string() }).nullable(),
  sonstiges: z.object({ betrag: z.number(), beschreibung: z.string() }).nullable(),
});

/** Per-calendar-day meal deductions, keyed by YYYY-MM-DD. */
export const verpflegungAbzugSchema = z.object({
  datum: z.string(),
  fruehstueck: z.boolean(),
  mittagessen: z.boolean(),
  abendessen: z.boolean(),
});

export const uebernachtungSchema = z.object({
  modus: uebernachtungModusSchema,
  /** For modus 'beleg'. */
  betrag: z.number().nullable(),
  /** For modus 'pauschal'. */
  naechte: z.number().nullable(),
});

export const reisekostenStateSchema = z.object({
  rateKey: rateKeySchema,
  stammdaten: stammdatenSchema,
  reise: reiseSchema,
  fahrt: fahrtSchema,
  /** Meal deductions the user selected per day (matched to derived days by datum). */
  verpflegungAbzuege: z.array(verpflegungAbzugSchema),
  uebernachtung: uebernachtungSchema.nullable(),
  /** Voluntary donation to BÜNDNIS 90/DIE GRÜNEN, subtracted from the payout. */
  spende: z.number(),
});

// ── Compute result ───────────────────────────────────────────────────────────

export const verpflegungTagSchema = z.object({
  datum: z.string(),
  typ: z.enum(['eintaegig', 'anreise', 'zwischen', 'abreise']),
  basis: z.number(),
  abzug: z.number(),
  summe: z.number(),
});

export const computeResultSchema = z.object({
  fahrtkosten: z.object({
    bahn: z.number(),
    oepnv: z.number(),
    kfz: z.number(),
    miete: z.number(),
    taxi: z.number(),
    sonstiges: z.number(),
    summe: z.number(),
  }),
  verpflegung: z.object({
    tage: z.array(verpflegungTagSchema),
    summe: z.number(),
  }),
  uebernachtung: z.object({ summe: z.number() }),
  gesamt: z.number(),
  spende: z.number(),
  auszahlung: z.number(),
});

// ── Validation findings ──────────────────────────────────────────────────────

export const findingSchema = z.object({
  level: findingLevelSchema,
  /** Dot-path of the offending field, e.g. 'fahrt.kfz.dbFlexpreis'. */
  field: z.string(),
  message: z.string(),
});

// ── /extract-beleg ───────────────────────────────────────────────────────────

export const extractBelegBodySchema = z.object({
  base64: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  belegType: belegTypSchema,
});

export const extractBelegResponseSchema = z.object({
  type: belegTypSchema,
  betrag: z.number().nullable(),
  datum: z.string().nullable(),
  von: z.string().nullable(),
  nach: z.string().nullable(),
  /** Hotel invoice only: breakfast shown as "Business-Package"/"Servicepauschale". */
  businessPackage: z.boolean().nullable(),
  confidence: z.number(),
  rohtext: z.string().optional(),
});

// ── /validate ────────────────────────────────────────────────────────────────

export const validateBodySchema = z.object({
  state: reisekostenStateSchema,
  belege: z.array(extractBelegResponseSchema).optional(),
});

export const validateResponseSchema = z.object({
  findings: z.array(findingSchema),
  compute: computeResultSchema,
});

// ── /pdf ─────────────────────────────────────────────────────────────────────

export const pdfBodySchema = z.object({
  state: reisekostenStateSchema,
});

export const pdfResponseSchema = z.object({
  filename: z.string(),
  /** base64-encoded PDF bytes. */
  pdfBase64: z.string(),
});

export const reisekostenErrorResponseSchema = z.object({
  error: z.string(),
});

// ── Inferred types ───────────────────────────────────────────────────────────

export type RateKey = z.infer<typeof rateKeySchema>;
export type FahrzeugTyp = z.infer<typeof fahrzeugTypSchema>;
export type UebernachtungModus = z.infer<typeof uebernachtungModusSchema>;
export type BelegTyp = z.infer<typeof belegTypSchema>;
export type Reiseart = z.infer<typeof reiseartSchema>;
export type FindingLevel = z.infer<typeof findingLevelSchema>;
export type Stammdaten = z.infer<typeof stammdatenSchema>;
export type Reise = z.infer<typeof reiseSchema>;
export type Kfz = z.infer<typeof kfzSchema>;
export type Miete = z.infer<typeof mieteSchema>;
export type Fahrt = z.infer<typeof fahrtSchema>;
export type VerpflegungAbzug = z.infer<typeof verpflegungAbzugSchema>;
export type Uebernachtung = z.infer<typeof uebernachtungSchema>;
export type ReisekostenState = z.infer<typeof reisekostenStateSchema>;
export type VerpflegungTag = z.infer<typeof verpflegungTagSchema>;
export type ComputeResult = z.infer<typeof computeResultSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ExtractBelegBody = z.infer<typeof extractBelegBodySchema>;
export type ExtractBelegResponse = z.infer<typeof extractBelegResponseSchema>;
export type ValidateBody = z.infer<typeof validateBodySchema>;
export type ValidateResponse = z.infer<typeof validateResponseSchema>;
export type PdfBody = z.infer<typeof pdfBodySchema>;
export type PdfResponse = z.infer<typeof pdfResponseSchema>;
