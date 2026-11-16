/**
 * Parteitage: Reden-Archiv je Parteitag (Reel, Transkript, Statistik).
 *
 * Kein Geschlecht, auf keiner Ebene: jedes Objekt ist `.strict()`, damit ein
 * Feld wie `geschlecht` den Import ablehnt statt still durchzurutschen. Die
 * Platzart (`frauenplatz`/`offen`) bleibt erlaubt.
 */
import { z } from 'zod';

import { subtitleWordSchema } from './subtitler.js';

// ── Enums ───────────────────────────────────────────────────────────────────

export const conventionAreaSchema = z.enum(['kreisfreie_stadt', 'kreis', 'ohne']);
export type ConventionArea = z.infer<typeof conventionAreaSchema>;

export const seatTypeSchema = z.enum(['frauenplatz', 'offen']);
export type SeatType = z.infer<typeof seatTypeSchema>;

export const conventionStatusSchema = z.enum(['draft', 'published', 'hidden']);
export type ConventionStatus = z.infer<typeof conventionStatusSchema>;

const conventionAudienceSchema = z.enum(['de-DE', 'de-AT', 'all']);

// ── Rede ────────────────────────────────────────────────────────────────────

export const speechAnalysisSchema = z
  .object({
    anrede: z.string().nullable(),
    schluss: z.array(z.string()),
    nennungen: z.record(z.string(), z.number().int()),
    signatur: z.string(),
    wpm: z.number().nullable(),
    woerter: z.number().int(),
    vorgetragen: z.boolean(),
  })
  .strict();
export type SpeechAnalysis = z.infer<typeof speechAnalysisSchema>;

export const manifestFileSchema = z
  .object({
    name: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();
export type ManifestFile = z.infer<typeof manifestFileSchema>;

// ── Statistik v1 ────────────────────────────────────────────────────────────

const countPairSchema = z.tuple([z.string(), z.number().int()]);

const resultStatSchema = z
  .object({
    n: z.number().int(),
    median: z.number(),
    mittel: z.number(),
    min: z.number(),
    max: z.number(),
  })
  .strict();

const statGroupSchema = z.record(z.string(), resultStatSchema);

const areaKeySchema = z.enum(['kreisfreie_stadt', 'kreis']);

const wahlSchema = z
  .object({
    formel: z.string(),
    gesamt: resultStatSchema,
    // Keyed by the seat-type enum: no other grouping key (gender) can slip in.
    platzart: z.partialRecord(seatTypeSchema, resultStatSchema),
    block: statGroupSchema,
    thema: statGroupSchema,
    anrede: statGroupSchema,
    korrelation: z.record(z.string(), z.number()),
    korrelationP: z.record(z.string(), z.number()),
    kampf: z.array(
      z
        .object({
          platz: z.number().int(),
          tag: z.string(),
          kandidierende: z.array(
            z
              .object({
                name: z.string(),
                anteil: z.number(),
                gewaehlt: z.boolean(),
              })
              .strict()
          ),
        })
        .strict()
    ),
    extreme: z
      .object({
        hoch: z.array(z.tuple([z.number().int(), z.string(), z.number()])),
        tief: z.array(z.tuple([z.number().int(), z.string(), z.number()])),
      })
      .strict(),
    raum: z.partialRecord(areaKeySchema, resultStatSchema),
    raumPlatzMedian: z.partialRecord(areaKeySchema, z.number()),
  })
  .strict();

const mottoSchema = z
  .object({
    gesamt: z.number().int(),
    sinngemaess: z.number().int(),
    reden: z.array(
      z
        .object({
          platz: z.number().int(),
          name: z.string(),
          n: z.number().int(),
          zitat: z.string(),
        })
        .strict()
    ),
  })
  .strict();

/** Full stats as the pipeline exports and the database stores them. */
export const conventionStatsV1Schema = z
  .object({
    gesamt: z
      .object({
        n: z.number().int(),
        topWoerter: z.array(countPairSchema),
        anrede: z.array(countPairSchema),
      })
      .strict(),
    wahl: wahlSchema,
    liste: z
      .object({
        bloecke: z.array(
          z
            .object({
              block: z.string(),
              kreisfreieStadt: z.number().int(),
              kreis: z.number().int(),
              ohne: z.number().int(),
            })
            .strict()
        ),
      })
      .strict(),
    vergleichRaum: z.array(
      z
        .object({
          art: z.string(),
          kategorie: z.string(),
          a: z.number(),
          na: z.number().int(),
          b: z.number(),
          nb: z.number().int(),
          p: z.number(),
          q: z.number(),
        })
        .strict()
    ),
    // [wort, n, z, ratio]
    signaturRaum: z.partialRecord(
      conventionAreaSchema,
      z.array(z.tuple([z.string(), z.number(), z.number(), z.number()]))
    ),
    motto: mottoSchema,
    methodik: z.array(z.object({ titel: z.string(), text: z.string() }).strict()),
    grenzen: z.string(),
  })
  .strict();

export type ConventionStatsV1 = z.infer<typeof conventionStatsV1Schema>;

/**
 * Stats as the API serves them. `wahl.kampf`, `wahl.extreme` and `motto.reden`
 * name individual people (vote shares, lowest results, quotes); the page shows
 * none of them, and a removed or hidden speech would stay visible there until
 * the next import. They stay in the database, never on the wire.
 */
export const conventionStatsPublicSchema = conventionStatsV1Schema
  .extend({
    wahl: wahlSchema.omit({ kampf: true, extreme: true }),
    motto: mottoSchema.omit({ reden: true }),
  })
  .strict();
export type ConventionStatsPublic = z.infer<typeof conventionStatsPublicSchema>;

// ── Manifest (Import) ───────────────────────────────────────────────────────

/** Convention key; also the storage-key prefix of its media. */
export const conventionKeySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/);

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const speechCoreShape = {
  key: z.string().min(1),
  day: isoDaySchema,
  dayLabel: z.string(),
  listPlace: z.number().int(),
  seatType: seatTypeSchema,
  firstName: z.string(),
  lastName: z.string(),
  kv: z.string(),
  area: conventionAreaSchema,
  contested: z.boolean(),
  elected: z.boolean().nullable(),
  resultPercent: z.number().nullable(),
  deliveredBy: z.string().nullable(),
  topic: z.string(),
  durationS: z.number(),
  wordCount: z.number().int(),
  analysis: speechAnalysisSchema,
};

export const conventionSpeechManifestSchema = z
  .object({
    ...speechCoreShape,
    transcript: z.string(),
    words: z.array(subtitleWordSchema),
    files: z.object({ reel: manifestFileSchema, poster: manifestFileSchema }).strict(),
  })
  .strict();
export type ConventionSpeechManifest = z.infer<typeof conventionSpeechManifestSchema>;

const httpUrlSchema = z.string().regex(/^https?:\/\//i);
const sourceLinkSchema = z.object({ label: z.string(), url: httpUrlSchema }).strict();

export const conventionManifestSchema = z
  .object({
    version: z.literal(1),
    key: conventionKeySchema,
    slugName: z.string().min(1),
    title: z.string(),
    shortTitle: z.string(),
    organizer: z.string(),
    audience: conventionAudienceSchema,
    startsOn: isoDaySchema,
    endsOn: isoDaySchema,
    location: z.string(),
    sourceLinks: z.array(sourceLinkSchema),
    report: manifestFileSchema.nullable(),
    statsVersion: z.literal(1),
    stats: conventionStatsV1Schema,
    speeches: z.array(conventionSpeechManifestSchema),
  })
  .strict();
export type ConventionManifest = z.infer<typeof conventionManifestSchema>;

// ── Antworten ───────────────────────────────────────────────────────────────

export const conventionSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  shortTitle: z.string(),
  organizer: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  location: z.string(),
  locked: z.boolean(),
  speechCount: z.number().int(),
});
export type ConventionSummary = z.infer<typeof conventionSummarySchema>;

export const conventionSpeechPublicSchema = z.object({
  ...speechCoreShape,
  id: z.string(),
  slug: z.string(),
  reelUrl: z.string(),
  posterUrl: z.string(),
  /** Only present for instance admins. */
  moderation: z.enum(['ok', 'hidden']).optional(),
  hiddenReason: z.string().nullable().optional(),
});
export type ConventionSpeechPublic = z.infer<typeof conventionSpeechPublicSchema>;

export const conventionDetailSchema = conventionSummarySchema.extend({
  stats: conventionStatsPublicSchema,
  sourceLinks: z.array(sourceLinkSchema),
  reportUrl: z.string().nullable(),
  speeches: z.array(conventionSpeechPublicSchema),
});
export type ConventionDetail = z.infer<typeof conventionDetailSchema>;

export const conventionSpeechDetailSchema = conventionSpeechPublicSchema.extend({
  transcript: z.string(),
});
export type ConventionSpeechDetail = z.infer<typeof conventionSpeechDetailSchema>;

export const conventionEditorDataSchema = z.object({
  speechId: z.string(),
  streamUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  durationS: z.number(),
  fileName: z.string(),
  words: z.array(subtitleWordSchema),
});
export type ConventionEditorData = z.infer<typeof conventionEditorDataSchema>;

// ── Fehler und Bodies ───────────────────────────────────────────────────────

export const parteitageErrorCodeSchema = z.enum([
  'NOT_FOUND',
  'FORBIDDEN',
  'LOCKED',
  'WRONG_PASSWORD',
  'BLOCKED_SPEECHES',
  'INVALID_MANIFEST',
  'MISSING_UPLOADS',
  'INTERNAL',
  'RATE_LIMITED',
]);

export type ParteitageErrorCode = z.infer<typeof parteitageErrorCodeSchema>;

export const parteitageErrorSchema = z.object({
  success: z.literal(false),
  code: parteitageErrorCodeSchema,
  message: z.string(),
  /** MISSING_UPLOADS: manifest file names without a usable upload. */
  files: z.array(z.string()).optional(),
});

export const parteitageUnlockBodySchema = z.object({ password: z.string().min(1) });
export const parteitageOkSchema = z.object({ success: z.literal(true) });

export const parteitageListResponseSchema = z.object({
  conventions: z.array(conventionSummarySchema),
});

export const parteitageAdminSummarySchema = conventionSummarySchema.extend({
  key: z.string(),
  status: conventionStatusSchema,
  audience: conventionAudienceSchema,
  hasPassword: z.boolean(),
});
export type ParteitageAdminSummary = z.infer<typeof parteitageAdminSummarySchema>;
export const parteitageAdminListResponseSchema = z.object({
  conventions: z.array(parteitageAdminSummarySchema),
});

export const parteitageFileHashesSchema = z.record(z.string(), z.string());

export const parteitageImportBodySchema = z.object({
  manifest: conventionManifestSchema,
  uploads: z.record(z.string(), z.string()),
  password: z.string().min(1).nullable(),
});
export const parteitageImportResponseSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  slug: z.string(),
  speechCount: z.number().int(),
});

export const parteitageUpdateBodySchema = z.object({
  status: conventionStatusSchema.optional(),
  password: z.string().min(1).nullable().optional(),
});

export const parteitageSpeechHiddenBodySchema = z.object({
  hidden: z.boolean(),
  reason: z.string(),
});
