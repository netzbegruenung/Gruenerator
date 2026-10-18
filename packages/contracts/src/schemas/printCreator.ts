/**
 * PrintSpec: what a print product (business card, poster) is made of, before
 * the composer lays it out on a canvas in print format.
 *
 * The format ids are persisted (F0): additive changes only.
 */
import { z } from 'zod';

export const PRINT_NAME_MAX = 60;
export const PRINT_HEADLINE_MAX = 80;
export const PRINT_TEXT_MAX = 120;

export const printLocaleSchema = z.enum(['de-DE', 'de-AT']);
export type PrintLocale = z.infer<typeof printLocaleSchema>;

export const printProduktSchema = z.enum(['visitenkarte', 'plakat']);
export type PrintProdukt = z.infer<typeof printProduktSchema>;

export const printVarianteSchema = z.enum(['visitenkarte', 'typo']);
export type PrintVariante = z.infer<typeof printVarianteSchema>;

/**
 * A colourway of a variante. Absent: the variante's standard look. Which
 * values a variante takes, per country, says `PRINT_VARIANTEN`.
 */
export const printStilSchema = z.enum(['klee', 'sand', 'schlicht', 'hellgruen', 'weiss', 'gruen']);
export type PrintStil = z.infer<typeof printStilSchema>;

export const printFormatIdSchema = z.enum([
  'print-visitenkarte-quer',
  'print-visitenkarte-hoch',
  'print-a3-hoch',
  'print-a4-hoch',
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

/** What each variante belongs to, which formats it lays out on, and its colourways per country. */
export const PRINT_VARIANTEN = {
  visitenkarte: {
    produkt: 'visitenkarte',
    formats: ['print-visitenkarte-quer', 'print-visitenkarte-hoch'],
    stile: { 'de-DE': ['klee', 'sand', 'schlicht'], 'de-AT': ['hellgruen', 'weiss', 'gruen'] },
  },
  typo: {
    produkt: 'plakat',
    formats: ['print-a3-hoch', 'print-a4-hoch'],
    stile: { 'de-DE': [], 'de-AT': [] },
  },
} as const satisfies Record<
  PrintVariante,
  {
    produkt: PrintProdukt;
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

export const printSpecSchema = z
  .discriminatedUnion('variante', [printVisitenkarteSpecSchema, printTypoSpecSchema])
  .superRefine((spec, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    const variante = PRINT_VARIANTEN[spec.variante];
    if (spec.produkt !== variante.produkt) {
      issue('produkt', `produkt passt nicht zu variante ${spec.variante}`);
    }
    if (!(variante.formats as readonly PrintFormatId[]).includes(spec.format)) {
      issue('format', `format ${spec.format} ist für ${spec.variante} nicht erlaubt`);
    }
    if (spec.stil && !(variante.stile[spec.locale] as readonly PrintStil[]).includes(spec.stil)) {
      issue('stil', `stil ${spec.stil} gibt es für ${spec.variante} in ${spec.locale} nicht`);
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
