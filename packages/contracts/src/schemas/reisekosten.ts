/**
 * Zod schemas for the Reisekosten (travel-expense) Grünerator.
 *
 * Single source of truth for the form state, the belege, the saved
 * Abrechnungen and the official form's field map. Types are derived via z.infer
 * and consumed by:
 *   - the deterministic engine in @gruenerator/shared/reisekosten
 *   - the ts-rest reisekostenContract (../contracts)
 *   - the web form, which fills the official PDF in the browser
 */
import { z } from 'zod';

// ── Enums (closed value sets) ────────────────────────────────────────────────

/** Rate-config key. NRW first; AT + other Landesverbände are added as config. */
export const rateKeySchema = z.enum(['de-DE/nrw']);

export const fahrzeugTypSchema = z.enum(['pkw', 'motorrad']);

export const uebernachtungModusSchema = z.enum(['lv_bezahlt', 'beleg', 'pauschal']);

export const belegTypSchema = z.enum(['bahn', 'oepnv', 'miete', 'taxi', 'hotel', 'sonstiges']);

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
  /** Form field „Wahl/Beschluss vom“: the election/decision that entitles the claim. */
  wahlBeschlussVom: z.string().optional(),
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
  /** No longer used for Kfz since the form of 1.7.2025; kept so stored drafts still parse. */
  dbFlexpreis: z.number().nullable(),
  /** A Vorstandsbeschluss allows km beyond kmObergrenze. */
  vorstandsbeschluss: z.boolean().optional(),
});

export const mieteSchema = z.object({
  betrag: z.number(),
  dbFlexpreis: z.number().nullable(),
  belegVorhanden: z.boolean(),
  /** Rental car / carsharing is reimbursable only with a Vorstandsbeschluss. */
  vorstandsbeschluss: z.boolean().optional(),
});

export const fahrtSchema = z.object({
  bahn: belegPositionSchema.nullable(),
  oepnv: belegPositionSchema.nullable(),
  kfz: kfzSchema.nullable(),
  miete: mieteSchema.nullable(),
  taxi: z
    .object({ betrag: z.number(), begruendung: z.string(), belegVorhanden: z.boolean() })
    .nullable(),
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

// ── Belege ───────────────────────────────────────────────────────────────────

/**
 * What a document is, independent of which form line it pays for. The line
 * (bahn, hotel, …) follows from the category via the registry in
 * @gruenerator/shared/reisekosten — `belegKategorien.ts`.
 */
export const belegKategorieSchema = z.enum([
  'db_rechnung',
  'db_ticket',
  'oepnv_ticket',
  'deutschlandticket',
  'flexpreis_vergleich',
  'routenplaner',
  'hotelrechnung',
  'taxiquittung',
  'mietwagenrechnung',
  'vorstandsbeschluss',
  'parkbeleg',
  'teilnahmebeitrag',
  'sonstiges',
]);

/** Where a beleg was read: only in the browser, its text sent, or the file sent for OCR. */
export const belegQuelleSchema = z.enum(['lokal', 'server-text', 'server-ocr']);

/**
 * Everything the app keeps about an uploaded beleg — except the file. The bytes
 * stay in the browser (IndexedDB); this metadata is what the server stores.
 */
export const belegMetaSchema = z.object({
  id: z.string(),
  dateiname: z.string(),
  mimeType: z.string(),
  groesse: z.number(),
  sha256: z.string(),
  kategorie: belegKategorieSchema,
  betrag: z.number().nullable(),
  datum: z.string().nullable(),
  von: z.string().nullable(),
  nach: z.string().nullable(),
  /** Hotel invoice only: breakfast shown as "Business-Package"/"Servicepauschale". */
  businessPackage: z.boolean().nullable(),
  quelle: belegQuelleSchema,
});

// ── /extract-beleg ───────────────────────────────────────────────────────────

/**
 * Text when the browser could read the document itself (a text PDF) — then the
 * file never leaves the device. The file only for scans and photos, which need OCR.
 */
export const extractBelegBodySchema = z.union([
  z.object({ text: z.string().min(1).max(20000), filename: z.string() }),
  z.object({ base64: z.string(), filename: z.string(), mimeType: z.string() }),
]);

export const extractBelegResponseSchema = z.object({
  kategorie: belegKategorieSchema,
  betrag: z.number().nullable(),
  datum: z.string().nullable(),
  von: z.string().nullable(),
  nach: z.string().nullable(),
  businessPackage: z.boolean().nullable(),
  quelle: belegQuelleSchema.exclude(['lokal']),
});

// ── Abrechnungen (saved drafts) ──────────────────────────────────────────────

/**
 * The part of the form state the server may hold. Address, phone and bank
 * details are browser-only: `pick` drops them, so a client that sends them
 * anyway has them stripped at the boundary instead of stored.
 */
export const reisekostenServerStateSchema = reisekostenStateSchema.extend({
  stammdaten: stammdatenSchema.pick({
    name: true,
    funktion: true,
    email: true,
    wahlBeschlussVom: true,
  }),
});

export const abrechnungStatusSchema = z.enum(['entwurf', 'eingereicht']);

export const abrechnungSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  titel: z.string(),
  status: abrechnungStatusSchema,
  state: reisekostenServerStateSchema,
  belege: z.array(belegMetaSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const abrechnungCreateBodySchema = z.object({
  state: reisekostenServerStateSchema,
});

export const abrechnungUpdateBodySchema = z.object({
  state: reisekostenServerStateSchema.optional(),
  belege: z.array(belegMetaSchema).optional(),
  status: abrechnungStatusSchema.optional(),
});

export const abrechnungListResponseSchema = z.object({
  abrechnungen: z.array(abrechnungSchema),
});

// ── /formular (official form template + field map) ───────────────────────────

/** A box in PDF user space (origin bottom-left, points). */
const formBoxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export const FORM_FIELD_KEYS = [
  'name',
  'funktion',
  'wahlBeschlussVom',
  'strasse',
  'hausnr',
  'email',
  'plzOrt',
  'telefon',
  'iban',
  'bic',
  'anlass',
  'ziel',
  'beginnDatum',
  'beginnZeit',
  'rueckkehrDatum',
  'rueckkehrZeit',
  'bahn',
  'oepnv',
  'kfzKm',
  'kfzBetrag',
  'kfzMehrKm',
  'kfzMehrBetrag',
  'kradKm',
  'kradBetrag',
  'miete',
  'taxi',
  'sonstiges',
  'summeFahrtkosten',
  'summeVerpflegung',
  'uebernachtungBeleg',
  'naechte',
  'uebernachtungPauschal',
  'summeUebernachtung',
  'gesamtbetrag',
  'spende',
  'auszahlung',
  'datum',
] as const;

export const formFieldKeySchema = z.enum(FORM_FIELD_KEYS);

export const formFieldSchema = formBoxSchema.extend({
  align: z.enum(['left', 'right', 'center']),
});

const formColumnSchema = z.object({ x: z.number(), w: z.number() });
const formRowSchema = z.object({ y: z.number(), h: z.number() });

/**
 * Where each value goes on the official form. The form has no AcroForm fields,
 * so it is filled by drawing at measured coordinates; the measurement lives
 * next to the PDF in the internal content repo and is validated here.
 */
export const reisekostenFormMapSchema = z.object({
  version: z.string(),
  rateKey: rateKeySchema,
  /** 0-based page index of the form itself; the others are the notes. */
  formPage: z.number().int(),
  fontSize: z.number(),
  fields: z.object(
    Object.fromEntries(FORM_FIELD_KEYS.map((k) => [k, formFieldSchema])) as Record<
      FormFieldKey,
      typeof formFieldSchema
    >
  ),
  /** Section 3 tick boxes, keyed by Übernachtung modus. */
  checkboxes: z.object({
    lv_bezahlt: formBoxSchema,
    beleg: formBoxSchema,
    pauschal: formBoxSchema,
  }),
  /** Section 2 grid: four day columns, one row per day type, plus the sum column. */
  verpflegung: z.object({
    columns: z.array(formColumnSchema).length(4),
    summe: formColumnSchema,
    rows: z.object({
      eintaegig: formRowSchema,
      anreise: formRowSchema,
      zwischen: formRowSchema,
      abreise: formRowSchema,
      abzug: formRowSchema,
    }),
  }),
  /** Values the Excel export printed into formula cells; painted over before filling. */
  whiteouts: z.array(formBoxSchema),
});

export const formularResponseSchema = z.object({
  /** base64-encoded blank form PDF. */
  pdfBase64: z.string(),
  map: reisekostenFormMapSchema,
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
export type BelegKategorie = z.infer<typeof belegKategorieSchema>;
export type BelegQuelle = z.infer<typeof belegQuelleSchema>;
export type BelegMeta = z.infer<typeof belegMetaSchema>;
export type ExtractBelegBody = z.infer<typeof extractBelegBodySchema>;
export type ExtractBelegResponse = z.infer<typeof extractBelegResponseSchema>;
export type ReisekostenServerState = z.infer<typeof reisekostenServerStateSchema>;
export type AbrechnungStatus = z.infer<typeof abrechnungStatusSchema>;
export type Abrechnung = z.infer<typeof abrechnungSchema>;
export type AbrechnungCreateBody = z.infer<typeof abrechnungCreateBodySchema>;
export type AbrechnungUpdateBody = z.infer<typeof abrechnungUpdateBodySchema>;
export type FormFieldKey = (typeof FORM_FIELD_KEYS)[number];
export type FormField = z.infer<typeof formFieldSchema>;
export type ReisekostenFormMap = z.infer<typeof reisekostenFormMapSchema>;
export type FormularResponse = z.infer<typeof formularResponseSchema>;
