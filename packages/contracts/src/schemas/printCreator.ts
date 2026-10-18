/**
 * PrintSpec: what a print product (business card, poster) is made of, before
 * the composer lays it out on a canvas in print format.
 *
 * The format ids are persisted (F0): additive changes only.
 */
import { z } from 'zod';

import { SHAREPIC_VORLAGE_REF, sharepicVorlageAssetPath } from './sharepicCreator.js';

export const PRINT_NAME_MAX = 60;
export const PRINT_HEADLINE_MAX = 80;
export const PRINT_TEXT_MAX = 120;
/** A Störer holds a few words (CD p. 15); the circle takes three lines at most. */
export const PRINT_STOERER_MAX = 40;
export const PRINT_MITWIRKENDE_MAX = 4;

export const printLocaleSchema = z.enum(['de-DE', 'de-AT']);
export type PrintLocale = z.infer<typeof printLocaleSchema>;

export const printProduktSchema = z.enum(['visitenkarte', 'plakat']);
export type PrintProdukt = z.infer<typeof printProduktSchema>;

export const printVarianteSchema = z.enum([
  'visitenkarte',
  'typo',
  'kandidat',
  'thema',
  'veranstaltung',
  'geteilt',
  'overlay',
  'person',
]);
export type PrintVariante = z.infer<typeof printVarianteSchema>;

/**
 * A colourway of a variante. Absent: the variante's standard look. Which
 * values a variante takes, per country, says `PRINT_VARIANTEN`.
 */
export const printStilSchema = z.enum([
  'klee',
  'sand',
  'schlicht',
  'hellgruen',
  'weiss',
  'gruen',
  'tanne',
  'portraits',
]);
export type PrintStil = z.infer<typeof printStilSchema>;

export const printFormatIdSchema = z.enum([
  'print-visitenkarte-quer',
  'print-visitenkarte-hoch',
  'print-a3-hoch',
  'print-a4-hoch',
  'print-a3-quer',
  'print-a1-hoch',
  'print-a1-quer',
  'print-grossflaeche',
  'print-citylight',
]);
export type PrintFormatId = z.infer<typeof printFormatIdSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);

export const printVisitenkarteSlotsSchema = z.object({
  name: text(PRINT_NAME_MAX),
  funktion: text(PRINT_TEXT_MAX).optional(),
  organisation: text(PRINT_TEXT_MAX).optional(),
  adresse: text(PRINT_TEXT_MAX).optional(),
  telefon: text(PRINT_TEXT_MAX).optional(),
  mobil: text(PRINT_TEXT_MAX).optional(),
  mail: text(PRINT_TEXT_MAX).optional(),
  web: text(PRINT_TEXT_MAX).optional(),
});
export type PrintVisitenkarteSlots = z.infer<typeof printVisitenkarteSlotsSchema>;

export const printTypoSlotsSchema = z.object({
  dachzeile: text(PRINT_TEXT_MAX).optional(),
  headline: text(PRINT_HEADLINE_MAX),
  akzent: text(PRINT_TEXT_MAX).optional(),
  subline: text(PRINT_TEXT_MAX).optional(),
  web: text(PRINT_TEXT_MAX).optional(),
  absender: text(PRINT_TEXT_MAX).optional(),
});
export type PrintTypoSlots = z.infer<typeof printTypoSlotsSchema>;

/** A photo a print Vorlage ships: a stock photo we host, or one of the catalogue's (`vorlage:<file>`). */
export const printFotoSchema = z
  .string()
  .regex(
    new RegExp(`^(?:[\\w.-]+\\.jpe?g|${SHAREPIC_VORLAGE_REF.source.slice(1, -1)})$`, 'i'),
    'Stockfoto oder vorlage:<datei>'
  );

/** Where the browser loads a print photo from. */
export const printFotoSrc = (foto: string): string =>
  SHAREPIC_VORLAGE_REF.test(foto)
    ? sharepicVorlageAssetPath(foto)
    : `/api/image-picker/stock-image/${encodeURIComponent(foto)}`;

/** Candidate poster (CD p. 38): the person on the photo, name and line below. */
export const printKandidatSlotsSchema = z.object({
  name: text(PRINT_NAME_MAX),
  subline: text(PRINT_TEXT_MAX).optional(),
  stoerer: text(PRINT_STOERER_MAX).optional(),
  web: text(PRINT_TEXT_MAX).optional(),
  foto: printFotoSchema,
});
export type PrintKandidatSlots = z.infer<typeof printKandidatSlotsSchema>;

/** Topic poster (CD p. 40): a photo and one statement. */
export const printThemaSlotsSchema = z.object({
  dachzeile: text(PRINT_TEXT_MAX).optional(),
  headline: text(PRINT_HEADLINE_MAX),
  akzent: text(PRINT_TEXT_MAX).optional(),
  stoerer: text(PRINT_STOERER_MAX).optional(),
  web: text(PRINT_TEXT_MAX).optional(),
  foto: printFotoSchema,
});
export type PrintThemaSlots = z.infer<typeof printThemaSlotsSchema>;

export const printMitwirkendeSchema = z.object({
  /** The line above a group: „Es diskutieren:“, „Begrüßung und Moderation:“. */
  rolle: text(PRINT_NAME_MAX).optional(),
  name: text(PRINT_NAME_MAX),
  funktion: text(PRINT_TEXT_MAX).optional(),
  /** `portraits` only: the round picture beside the name. */
  foto: printFotoSchema.optional(),
});
export type PrintMitwirkende = z.infer<typeof printMitwirkendeSchema>;

/** Event poster (CD p. 23 V1, p. 26 V2 `portraits`): topic, who speaks, when and where. */
export const printVeranstaltungSlotsSchema = z.object({
  dachzeile: text(PRINT_TEXT_MAX).optional(),
  headline: text(PRINT_HEADLINE_MAX),
  akzent: text(PRINT_TEXT_MAX).optional(),
  subline: text(PRINT_TEXT_MAX).optional(),
  /** Date and time, set in the Störer: „Freitag 27.10. 19 Uhr“. */
  datum: text(PRINT_STOERER_MAX).optional(),
  mitwirkende: z.array(printMitwirkendeSchema).max(PRINT_MITWIRKENDE_MAX).optional(),
  ort: text(PRINT_TEXT_MAX).optional(),
  web: text(PRINT_TEXT_MAX).optional(),
  /** V1's photo; `portraits` has none. */
  foto: printFotoSchema.optional(),
});
export type PrintVeranstaltungSlots = z.infer<typeof printVeranstaltungSlotsSchema>;

/** AT posters (CD 2026 p. 80–84): one headline with its yellow accent, on or beside a photo. */
export const printAtPlakatSlotsSchema = z.object({
  headline: text(PRINT_HEADLINE_MAX),
  akzent: text(PRINT_TEXT_MAX).optional(),
  subline: text(PRINT_TEXT_MAX).optional(),
  stoerer: text(PRINT_STOERER_MAX).optional(),
  foto: printFotoSchema,
});
export type PrintAtPlakatSlots = z.infer<typeof printAtPlakatSlotsSchema>;

/** DE: V.i.S.d.P. */
export const printImpressumDeSchema = z.object({
  art: z.literal('visdp'),
  name: text(PRINT_NAME_MAX),
  anschrift: text(PRINT_TEXT_MAX),
});
/** AT: Medieninhaber laut Mediengesetz. */
export const printImpressumAtSchema = z.object({
  art: z.literal('impressum'),
  medieninhaber: text(PRINT_TEXT_MAX),
  anschrift: text(PRINT_TEXT_MAX),
});
export const printImpressumSchema = z.discriminatedUnion('art', [
  printImpressumDeSchema,
  printImpressumAtSchema,
]);
export type PrintImpressum = z.infer<typeof printImpressumSchema>;

const AT_PLAKAT_FORMATS = [
  'print-a1-hoch',
  'print-a1-quer',
  'print-a3-hoch',
  'print-a3-quer',
] as const satisfies readonly PrintFormatId[];

/**
 * What each variante belongs to, the countries whose CD has it, which formats
 * it lays out on, and its colourways per country.
 */
export const PRINT_VARIANTEN = {
  visitenkarte: {
    produkt: 'visitenkarte',
    laender: ['de-DE', 'de-AT'],
    formats: ['print-visitenkarte-quer', 'print-visitenkarte-hoch'],
    stile: { 'de-DE': ['klee', 'sand', 'schlicht'], 'de-AT': ['hellgruen', 'weiss', 'gruen'] },
  },
  typo: {
    produkt: 'plakat',
    laender: ['de-DE', 'de-AT'],
    formats: ['print-a3-hoch', 'print-a4-hoch', 'print-a1-hoch'],
    stile: { 'de-DE': ['klee'], 'de-AT': [] },
  },
  // Absent stil: the photo fills the page; `tanne`/`klee`: it touches one or two edges (CD p. 38–41).
  kandidat: {
    produkt: 'plakat',
    laender: ['de-DE'],
    formats: ['print-a1-hoch', 'print-a3-hoch', 'print-grossflaeche', 'print-citylight'],
    stile: { 'de-DE': ['tanne', 'klee'], 'de-AT': [] },
  },
  thema: {
    produkt: 'plakat',
    laender: ['de-DE'],
    formats: ['print-a1-hoch', 'print-a3-hoch', 'print-grossflaeche', 'print-citylight'],
    stile: { 'de-DE': ['tanne', 'klee'], 'de-AT': [] },
  },
  veranstaltung: {
    produkt: 'plakat',
    laender: ['de-DE'],
    formats: ['print-a3-hoch', 'print-a3-quer', 'print-a1-hoch', 'print-a1-quer'],
    stile: { 'de-DE': ['portraits'], 'de-AT': [] },
  },
  // AT: the photo beside the green (p. 80), under a square box (p. 81/82, `hellgruen`), or the person (p. 83).
  geteilt: {
    produkt: 'plakat',
    laender: ['de-AT'],
    formats: AT_PLAKAT_FORMATS,
    stile: { 'de-DE': [], 'de-AT': [] },
  },
  overlay: {
    produkt: 'plakat',
    laender: ['de-AT'],
    formats: AT_PLAKAT_FORMATS,
    stile: { 'de-DE': [], 'de-AT': ['hellgruen'] },
  },
  person: {
    produkt: 'plakat',
    laender: ['de-AT'],
    formats: AT_PLAKAT_FORMATS,
    stile: { 'de-DE': [], 'de-AT': [] },
  },
} as const satisfies Record<
  PrintVariante,
  {
    produkt: PrintProdukt;
    laender: readonly PrintLocale[];
    formats: readonly PrintFormatId[];
    stile: Record<PrintLocale, readonly PrintStil[]>;
  }
>;

const printBase = {
  locale: printLocaleSchema,
  produkt: printProduktSchema,
  format: printFormatIdSchema,
  impressum: printImpressumSchema.nullable(),
  stil: printStilSchema.optional(),
};

const printVisitenkarteSpecSchema = z.object({
  ...printBase,
  variante: z.literal('visitenkarte'),
  slots: printVisitenkarteSlotsSchema,
});
const printTypoSpecSchema = z.object({
  ...printBase,
  variante: z.literal('typo'),
  slots: printTypoSlotsSchema,
});

const printKandidatSpecSchema = z.object({
  ...printBase,
  variante: z.literal('kandidat'),
  slots: printKandidatSlotsSchema,
});
const printThemaSpecSchema = z.object({
  ...printBase,
  variante: z.literal('thema'),
  slots: printThemaSlotsSchema,
});
const printVeranstaltungSpecSchema = z.object({
  ...printBase,
  variante: z.literal('veranstaltung'),
  slots: printVeranstaltungSlotsSchema,
});
const printAtPlakatSpecSchema = z.object({
  ...printBase,
  variante: z.enum(['geteilt', 'overlay', 'person']),
  slots: printAtPlakatSlotsSchema,
});

export const printSpecSchema = z
  .discriminatedUnion('variante', [
    printVisitenkarteSpecSchema,
    printTypoSpecSchema,
    printKandidatSpecSchema,
    printThemaSpecSchema,
    printVeranstaltungSpecSchema,
    printAtPlakatSpecSchema,
  ])
  .superRefine((spec, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    const variante = PRINT_VARIANTEN[spec.variante];
    if (!(variante.laender as readonly PrintLocale[]).includes(spec.locale)) {
      issue('variante', `variante ${spec.variante} gibt es in ${spec.locale} nicht`);
    }
    if (spec.produkt !== variante.produkt) {
      issue('produkt', `produkt passt nicht zu variante ${spec.variante}`);
    }
    if (!(variante.formats as readonly PrintFormatId[]).includes(spec.format)) {
      issue('format', `format ${spec.format} ist für ${spec.variante} nicht erlaubt`);
    }
    if (spec.stil && !(variante.stile[spec.locale] as readonly PrintStil[]).includes(spec.stil)) {
      issue('stil', `stil ${spec.stil} gibt es für ${spec.variante} in ${spec.locale} nicht`);
    }
    if (spec.variante === 'veranstaltung' && spec.stil !== 'portraits' && !spec.slots.foto) {
      issue('slots', 'Das Veranstaltungsplakat V1 braucht ein Foto');
    }
    if (spec.produkt === 'plakat' && spec.impressum === null) {
      issue('impressum', 'Plakate brauchen ein Impressum bzw. V.i.S.d.P.');
    }
    if (spec.impressum !== null) {
      const expected = spec.locale === 'de-AT' ? 'impressum' : 'visdp';
      if (spec.impressum.art !== expected) {
        issue('impressum', `impressum.art muss ${expected} sein für ${spec.locale}`);
      }
    }
  });
export type PrintSpec = z.infer<typeof printSpecSchema>;
