/**
 * Grünerator-Vorlagen for sharepics: ready creator specs people copy and edit,
 * each with the chat prompts that would produce one like it.
 *
 * Only the shape lives here. The entries are party content and live in the
 * private checkout (`<INTERN_CONTENT_DIR>/sharepic-vorlagen/{de,at}.json`),
 * served by `/api/sharepic-vorlagen` — never bundled.
 */
import { z } from 'zod';

import {
  printFormatIdSchema,
  printLocaleSchema,
  printSpecSchema,
  type PrintSpec,
} from './printCreator.js';
import {
  sharepicColorSchema,
  sharepicCreatorLocaleSchema,
  sharepicFormatSchema,
  sharepicFormSchema,
  sharepicItemSchema,
  sharepicPhotoAttributionSchema,
  sharepicSlideSchema,
  sharepicSpecSchema,
  sharepicThemaSchema,
  themaOfColor,
  type SharepicFormat,
} from './sharepicCreator.js';

export const sharepicVorlageIdSchema = z.string().regex(/^[a-z0-9-]{3,64}$/);

/** Where an entry comes from: a rebuilt party post, or one of the retired template types. */
export const sharepicVorlageHerkunftSchema = z.enum(['beispiel', 'alt-template']);
export type SharepicVorlageHerkunft = z.infer<typeof sharepicVorlageHerkunftSchema>;

/** One entry as the private file holds it. Its locale is `spec.locale`. */
export const sharepicVorlageFileEntrySchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string().min(1).max(80),
  beschreibung: z.string().min(1).max(280),
  /**
   * What a post needs to fit this Vorlage („Termin mit Datum und Ort",
   * „längeres Statement einer Person"). `beschreibung` says how it looks; the
   * chat picks Vorlagen for a post by this line, falling back to `beschreibung`.
   */
  anlass: z.string().min(1).max(160).optional(),
  form: sharepicFormSchema,
  herkunft: sharepicVorlageHerkunftSchema,
  /** Requests in the country's own words that make the creator build one like it. */
  chat: z.object({ prompts: z.array(z.string().min(3).max(240)).min(1).max(4) }),
  spec: sharepicSpecSchema,
});
export type SharepicVorlageFileEntry = z.infer<typeof sharepicVorlageFileEntrySchema>;

export const sharepicVorlageSchema = sharepicVorlageFileEntrySchema.extend({
  locale: sharepicCreatorLocaleSchema,
  /** Stock photo credits, one per slide (null on colour or painted slides). */
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
  /** Content hash of the preview images; clients pass it on to `sharepicVorlageThumbPath`. */
  thumbVersion: z.string().optional(),
});
export type SharepicVorlage = z.infer<typeof sharepicVorlageSchema>;

/**
 * Grünerator-Seiten: single slides people add to their own carousel, kept
 * apart from the Vorlagen because a slide out of a sequence needs its own
 * example text. Files: `sharepic-vorlagen/seiten/{de,at}.json`, previews
 * `thumbs/seiten/<id>.<format>.webp`.
 */
export const sharepicSeiteRolleSchema = z.enum(['titel', 'inhalt', 'schluss']);
export type SharepicSeiteRolle = z.infer<typeof sharepicSeiteRolleSchema>;

/** What the slide holds — the filter in the editor. */
export const sharepicSeiteTypSchema = z.enum([
  'text',
  'liste',
  'frage',
  'zitat',
  'diagramm',
  'aufruf',
]);
export type SharepicSeiteTyp = z.infer<typeof sharepicSeiteTypSchema>;

/** One entry as the private file holds it. Its locale is the file's country. */
export const sharepicSeiteFileEntrySchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string().min(1).max(80),
  rolle: sharepicSeiteRolleSchema,
  typ: sharepicSeiteTypSchema,
  /** The formats the slide was checked in; each has its own preview. */
  formats: z
    .array(sharepicFormatSchema)
    .min(1)
    .refine((f) => new Set(f).size === f.length, 'formats doppelt'),
  slide: sharepicSlideSchema,
  /** A themed slide (Pride, Frauen): composed with that theme, offered beside its kind. */
  thema: sharepicThemaSchema.optional(),
  /** The Vorlage slide this one was taken from — for upkeep only. */
  quelle: z.object({ vorlage: sharepicVorlageIdSchema, seite: z.number().int().min(1) }).optional(),
});
export type SharepicSeiteFileEntry = z.infer<typeof sharepicSeiteFileEntrySchema>;

export const sharepicSeiteSchema = sharepicSeiteFileEntrySchema.extend({
  locale: sharepicCreatorLocaleSchema,
  /** Stock photo credit, null on colour or painted slides. */
  attribution: sharepicPhotoAttributionSchema.nullable(),
  /** Content hash of the previews; clients pass it on to `sharepicSeiteThumbPath`. */
  thumbVersion: z.string().optional(),
});
export type SharepicSeite = z.infer<typeof sharepicSeiteSchema>;

/**
 * Grünerator-Blöcke: one or two slide items (a list on its card, a quote, a
 * Terminliste …) the editor composes and drops onto the current page as
 * separate elements. Files: `sharepic-vorlagen/bloecke/{de,at}.json`,
 * previews `thumbs/bloecke/<id>.webp` (the block alone, cut to its bounds).
 */
export const sharepicBlockGruppeSchema = z.enum(['kopf', 'listen', 'text', 'zahlen', 'meldungen']);
export type SharepicBlockGruppe = z.infer<typeof sharepicBlockGruppeSchema>;

/** One entry as the private file holds it. Its locale is the file's country. */
export const sharepicBlockFileEntrySchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string().min(1).max(80),
  gruppe: sharepicBlockGruppeSchema,
  /** Search words beside the title („Aufzählung“, „Mythos“). */
  stichworte: z.array(z.string().min(2).max(40)).max(8).default([]),
  items: z.array(sharepicItemSchema).min(1).max(2),
  /** The ground the preview was composed on; the editor composes on the page's own. */
  color: sharepicColorSchema,
});
export type SharepicBlockFileEntry = z.infer<typeof sharepicBlockFileEntrySchema>;

export const sharepicBlockSchema = sharepicBlockFileEntrySchema.extend({
  locale: sharepicCreatorLocaleSchema,
  /** Content hash of the preview; clients pass it on to `sharepicBlockThumbPath`. */
  thumbVersion: z.string().optional(),
});
export type SharepicBlock = z.infer<typeof sharepicBlockSchema>;

export const sharepicBloeckeListResponseSchema = z.object({
  bloecke: z.array(sharepicBlockSchema),
});

/** A block's preview, served from the private checkout. */
export const sharepicBlockThumbPath = (id: string, version?: string): string =>
  `/api/sharepic-vorlagen/bloecke/${encodeURIComponent(id)}/thumb${version ? `?v=${encodeURIComponent(version)}` : ''}`;

/**
 * The one-slide spec a block is composed (and checked) as: its items alone on
 * a colour ground. A themed ground brings its thema, so a block set on a lila
 * page takes the page's ink.
 */
export const sharepicBlockSpec = (
  locale: z.infer<typeof sharepicCreatorLocaleSchema>,
  block: Pick<SharepicBlockFileEntry, 'items' | 'color'>,
  format?: SharepicFormat
) => {
  const thema = themaOfColor(block.color);
  return {
    locale,
    ...(format ? { format } : {}),
    ...(thema ? { thema } : {}),
    slides: [
      {
        background: { kind: 'farbe' as const, color: block.color },
        position: 'mitte' as const,
        align: 'links' as const,
        items: block.items,
        logo: false,
      },
    ],
  };
};

/**
 * Every canvas format a document can have — the sharepic ones, the square
 * profile picture (also the sticker sheet) and print. Mirrors `CANVAS_FORMATS`
 * in the canvas editor, which checks itself against this list.
 */
export const canvasFormatIdSchema = z.enum([
  ...sharepicFormatSchema.options,
  'profile-square',
  ...printFormatIdSchema.options,
]);
export type CanvasFormatId = z.infer<typeof canvasFormatIdSchema>;

/** Whether a value holds a `blob:` URL anywhere — it dies with the tab that made it. */
const holdsBlobUrl = (value: unknown): boolean =>
  typeof value === 'string'
    ? value.startsWith('blob:')
    : Array.isArray(value)
      ? value.some(holdsBlobUrl)
      : typeof value === 'object' && value !== null && Object.values(value).some(holdsBlobUrl);

/** A page as the editor holds it: its template and that template's state. */
export const canvasVorlagePageSchema = z.object({
  configId: z.string().min(1).max(40),
  state: z
    .record(z.string(), z.unknown())
    .refine((state) => !holdsBlobUrl(state), 'holds a blob: URL — upload the image first'),
});
export type CanvasVorlagePage = z.infer<typeof canvasVorlagePageSchema>;

/**
 * A Grünerator-Vorlage for any format, saved as finished editor pages instead
 * of a sharepic spec — exported from the editor by an instance admin. The
 * Vorlagen tab offers the ones of the document's format. Entries live in the
 * private checkout (`sharepic-vorlagen/canvas/{de,at}.json`).
 */
export const canvasVorlageFileEntrySchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string().min(1).max(80),
  beschreibung: z.string().max(280),
  format: canvasFormatIdSchema,
  pages: z.array(canvasVorlagePageSchema).min(1).max(30),
});
export type CanvasVorlageFileEntry = z.infer<typeof canvasVorlageFileEntrySchema>;

export const canvasVorlageSchema = canvasVorlageFileEntrySchema.extend({
  locale: sharepicCreatorLocaleSchema,
  /** Content hash of the preview; clients pass it on to `canvasVorlageThumbPath`. */
  thumbVersion: z.string().optional(),
});
export type CanvasVorlage = z.infer<typeof canvasVorlageSchema>;

export const canvasVorlagenListResponseSchema = z.object({
  vorlagen: z.array(canvasVorlageSchema),
});

/** A canvas Vorlage's preview (its first page), served from the private checkout. */
export const canvasVorlageThumbPath = (id: string, version?: string): string =>
  `/api/sharepic-vorlagen/canvas/${encodeURIComponent(id)}/thumb${version ? `?v=${encodeURIComponent(version)}` : ''}`;

/**
 * The placeholder values the print Vorlagen ship in their impressum. The
 * editor's export gate treats them as „not filled in yet“, so a Vorlage must
 * use exactly these — the catalogue skips one that does not.
 */
export const PRINT_IMPRESSUM_PLACEHOLDERS = [
  'Vorname Nachname',
  'Name/Organisation',
  'Straße Nr., PLZ Ort',
] as const;

/** Shown with every print Vorlage and every print PDF until a test print has been checked. */
export const PRINT_UNGETESTET_HINWEIS =
  'Die Druckergebnisse sind bisher ungetestet. Lass vor einer großen Auflage einen Probedruck machen.';

/** Whether the spec's impressum, if any, holds only the placeholders. */
export function printImpressumIsPlaceholder(spec: PrintSpec): boolean {
  const { impressum } = spec;
  if (!impressum) return true;
  const values = [
    impressum.art === 'visdp' ? impressum.name : impressum.medieninhaber,
    impressum.anschrift,
  ];
  return values.every((v) => (PRINT_IMPRESSUM_PLACEHOLDERS as readonly string[]).includes(v));
}

/** Printed pages per product: a card, flyer and letterhead have two, the newspaper four. */
const PRINT_SEITEN: Record<PrintSpec['produkt'], number> = {
  visitenkarte: 2,
  plakat: 1,
  flyer: 2,
  briefbogen: 2,
  zeitung: 4,
};

export const printSeitenOf = (spec: Pick<PrintSpec, 'produkt'>): number =>
  PRINT_SEITEN[spec.produkt];

/**
 * A print Vorlage (gallery category „Print"): a placeholder spec the composer
 * turns into pages. One file per country in the private content checkout,
 * `print/{de,at}.json`. The ids are persisted (F0): links, likes and
 * bookmarks point at them.
 */
export const printVorlageFileEntrySchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string().min(1).max(80),
  beschreibung: z.string().max(280),
  spec: printSpecSchema,
});
export type PrintVorlageFileEntry = z.infer<typeof printVorlageFileEntrySchema>;

export const printVorlageSchema = printVorlageFileEntrySchema.extend({
  locale: printLocaleSchema,
  /** Content hash of the previews; clients pass it on to `printVorlageThumbPath`. */
  thumbVersion: z.string().optional(),
});
export type PrintVorlage = z.infer<typeof printVorlageSchema>;

export const printVorlagenListResponseSchema = z.object({
  vorlagen: z.array(printVorlageSchema),
});

/** Page `seite` (1-based) of a print Vorlage's preview; the back of a card is page 2. */
export const printVorlageThumbPath = (id: string, seite = 1, version?: string): string => {
  const query = new URLSearchParams();
  if (seite > 1) query.set('seite', String(seite));
  if (version) query.set('v', version);
  const search = query.toString();
  return `/api/sharepic-vorlagen/print/${encodeURIComponent(id)}/thumb${search ? `?${search}` : ''}`;
};

export const sharepicSeitenListResponseSchema = z.object({
  seiten: z.array(sharepicSeiteSchema),
});

/** A Seite's preview in one format, served from the private checkout. */
export const sharepicSeiteThumbPath = (
  id: string,
  format: SharepicFormat,
  version?: string
): string => {
  const query = new URLSearchParams({ format });
  if (version) query.set('v', version);
  return `/api/sharepic-vorlagen/seiten/${encodeURIComponent(id)}/thumb?${query.toString()}`;
};

/**
 * `?land=` on the Vorlagen lists (catalogue, gallery, „Beliebte Vorlagen"):
 * the country to show instead of the viewer's own. Honoured for instance
 * admins only; for everyone else the server ignores it.
 */
export const vorlagenLandQuerySchema = z.object({
  land: sharepicCreatorLocaleSchema.optional(),
});

export const sharepicVorlagenListResponseSchema = z.object({
  vorlagen: z.array(sharepicVorlageSchema),
});

export const sharepicVorlagenErrorSchema = z.object({ error: z.string() });

/**
 * A slide's preview image (1-based; a carousel has one per slide), served from
 * the private checkout — needs the session like every API call.
 */
export const sharepicVorlageThumbPath = (id: string, seite = 1, version?: string): string => {
  const query = new URLSearchParams();
  if (seite > 1) query.set('seite', String(seite));
  if (version) query.set('v', version);
  const search = query.toString();
  return `/api/sharepic-vorlagen/${encodeURIComponent(id)}/thumb${search ? `?${search}` : ''}`;
};

/** The change request that fills a Vorlage's spec with new content (studio copy and chat). */
export const vorlageFillPrompt = (beitrag: string): string =>
  `Übertrage den Inhalt dieses Beitrags in das Sharepic. Behalte Form, Layout, Farben und Seitenzahl bei, ersetze nur die Texte (und passende Fotos), kürze auf das Wesentliche:\n\n${beitrag}`;

/**
 * The chat's `vorlagen_vorschlagen` result: catalogue Vorlagen picked for the
 * post at hand, each with the one line why. The same shape is the live
 * `vorlagen_suggestions` event and the persisted tool result it is rebuilt
 * from on reload.
 */
export const sharepicVorlagenSuggestionSchema = z.object({
  id: sharepicVorlageIdSchema,
  titel: z.string(),
  form: sharepicFormSchema,
  grund: z.string(),
  format: sharepicFormatSchema,
  seiten: z.number().int().min(1),
  thumbUrl: z.string(),
});
export type SharepicVorlagenSuggestion = z.infer<typeof sharepicVorlagenSuggestionSchema>;

export const sharepicVorlagenSuggestionsSchema = z.object({
  vorlagen: z.array(sharepicVorlagenSuggestionSchema).min(1),
  /** The post the Vorlagen were picked for — what „Mit meinem Text erstellen" fills in. */
  beitrag: z.string().max(3000).optional(),
});
export type SharepicVorlagenSuggestions = z.infer<typeof sharepicVorlagenSuggestionsSchema>;
