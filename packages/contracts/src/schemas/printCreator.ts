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

const VISITENKARTE_FORMATS: readonly PrintFormatId[] = [
  'print-visitenkarte-quer',
  'print-visitenkarte-hoch',
];
const TYPO_FORMATS: readonly PrintFormatId[] = ['print-a3-hoch', 'print-a4-hoch'];

const printBase = {
  locale: printLocaleSchema,
  produkt: printProduktSchema,
  format: printFormatIdSchema,
  impressum: printImpressumSchema.nullable(),
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

    const isCard = spec.variante === 'visitenkarte';
    if (spec.produkt !== (isCard ? 'visitenkarte' : 'plakat')) {
      issue('produkt', `produkt passt nicht zu variante ${spec.variante}`);
    }
    if (!(isCard ? VISITENKARTE_FORMATS : TYPO_FORMATS).includes(spec.format)) {
      issue('format', `format ${spec.format} ist für ${spec.variante} nicht erlaubt`);
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
