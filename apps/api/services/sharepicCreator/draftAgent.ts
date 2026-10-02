/**
 * Free-text sharepic creator — the drafting step (experimental).
 *
 * Two forced tool calls on Gemma 4 (Melious), so only the knowledge a draft
 * needs reaches the prompt:
 *  1. `bedarf_melden` — the model names the country, the style-guide chapters
 *     and worked examples it wants, and what photos to search for. We load
 *     and search.
 *  2. `entwurf_abgeben` — with exactly those chapters, examples and hits in
 *     the prompt, the model writes the spec. `validateDraft` checks it against
 *     the schema AND the catalog; a rejection goes back as a repair turn.
 *
 * A fixed two-step sequence rather than an open tool loop: same on-demand
 * knowledge, but two calls with a known cost and no Melious stream quirks.
 */
import {
  type SharepicCreatorLocale,
  type SharepicDraftResponse,
  type SharepicSlide,
  type SharepicSpec,
  sharepicCreatorLocaleSchema,
  sharepicSpecSchema,
  hasUnpairedAccentMark,
  tightenAccentMarksDeep,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { GEMMA_31B_ON_MELIOUS } from '../ai/gemmaHosts.js';
import { aiObject } from '../ai/generate.js';
import { getAttribution } from '../image/UnsplashAttributionService.js';

import { hasStockPhoto, searchStockPhotos, type StockPhoto } from './catalog.js';
import {
  basicsText,
  chapterText,
  EXAMPLE_OCCASIONS,
  exampleOccasionSchema,
  examplesText,
  STYLEGUIDE_CHAPTERS,
  type StyleguideChapter,
  styleguideChapterSchema,
  systemPrompt,
} from './styleguide.js';

import type { StructuredValidation } from '../ai/structuredParsing.js';

const log = createLogger('sharepicCreator:draft');

const PINNED = { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model };

const needsSchema = z.object({
  land: sharepicCreatorLocaleSchema,
  anlass: z.array(exampleOccasionSchema).max(2),
  kapitel: z.array(styleguideChapterSchema).max(Object.keys(STYLEGUIDE_CHAPTERS).length),
  // A carousel may want a photo per slide.
  fotos_suchen: z.array(z.string().trim().min(2)).max(6),
});
type Needs = z.infer<typeof needsSchema>;

function fromZod<T>(schema: z.ZodType<T>, input: unknown): StructuredValidation<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; '),
  };
}

const NO_CONTACT = /(https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,})/i;

function textsOf(slide: SharepicSlide): string[] {
  const texts = slide.items.flatMap((item) => {
    switch (item.type) {
      case 'headline':
        return item.lines;
      case 'liste':
        return item.items;
      case 'zitat':
        return [item.text, item.name, item.funktion ?? '', item.quelle ?? ''];
      case 'frage':
        return [item.text, item.von ?? ''];
      default:
        return [item.text];
    }
  });
  if (slide.stoerer) texts.push(slide.stoerer.text);
  if (slide.ort) texts.push(...slide.ort.lines);
  if (slide.quelle) texts.push(slide.quelle);
  return texts;
}

/**
 * The brief is a quote when it says "Zitat" and carries a quoted passage.
 * Straight quotes must open after whitespace, so a revision's JSON
 * (`"text":"…"`) does not count.
 */
const QUOTED_PASSAGE = /„[^“”"]{8,}[“”"]|»[^«]{8,}«|(?:^|\s)"[^"]{8,}"/;
export function isQuoteBrief(given: string): boolean {
  return /\bZitat\b/.test(given) && QUOTED_PASSAGE.test(given);
}

/**
 * A speaker counts as named only where a name stands: the capitalised pair
 * directly before the colon / quote ("Sabine Moser: „…“") or after "von"
 * ("Zitat von Lena Hoffmann"). Capitalised nouns elsewhere ("Neues Sharepic
 * mit Zitat", "Grünen Woche") are no speaker. Conservative on purpose: a miss
 * only drops the extra guard, a false hit would demand a name that is not there.
 */
const NAME_PAIR = '\\p{Lu}[\\p{L}-]+\\s+\\p{Lu}[\\p{L}-]+';
const SPEAKER_BEFORE_QUOTE = new RegExp(
  `(?:^|[\\s,])(?:(\\p{Ll}+)\\s+)?(${NAME_PAIR})\\s*:\\s*$`,
  'u'
);
const SPEAKER_AFTER_VON = new RegExp(`\\bvon\\s+(${NAME_PAIR})`, 'u');
/** "zur Grünen Woche:" — a noun phrase behind a preposition or article, not a person. */
const NOT_A_NAME_INTRO =
  /^(?:zu[rm]?|der|des|die|den|dem|im|in|bei|mit|für|auf|am|aus|nach|vom|ins|über|um|zum)$/;
export function namesSpeaker(given: string): boolean {
  const quote = given.search(QUOTED_PASSAGE);
  const before = (quote === -1 ? given : given.slice(0, quote)).replace(/\bZitat\b/g, ' ');
  const match = SPEAKER_BEFORE_QUOTE.exec(before.trimEnd());
  if (match && !(match[1] && NOT_A_NAME_INTRO.test(match[1]))) return true;
  return SPEAKER_AFTER_VON.test(before);
}

/** Words that say nothing about which medium a quote came from. */
const GENERIC_SOURCE_WORDS = new Set(['Interview', 'Im', 'Mit', 'Der', 'Die', 'Dem', 'Das', 'Auf']);

/** `quelle` may only name a medium the brief names — an invented one is a false attribution. */
function sourceInBrief(quelle: string, given: string): boolean {
  const words = quelle.match(/\p{Lu}[\p{L}-]*/gu) ?? [];
  return words.some((w) => !GENERIC_SOURCE_WORDS.has(w) && given.includes(w));
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
/** `3.300` and `3300` are the same number — compare digits only. */
const digits = (value: string) => value.replace(/[.,]/g, '');

/**
 * Schema plus everything the schema cannot know: catalog ids, invented
 * contact data, and invented numbers — a critique carousel lives on its
 * figures, so every one of them must come from the request.
 */
export function validateDraft(
  input: unknown,
  locale: SharepicCreatorLocale,
  given: string
): StructuredValidation<SharepicSpec> {
  const base = fromZod(sharepicSpecSchema, {
    ...(tightenAccentMarksDeep(input) as object),
    locale,
  });
  if (!base.ok) return base;
  const errors: string[] = [];
  if (isQuoteBrief(given) && namesSpeaker(given)) {
    const zitate = base.value.slides.flatMap((slide) =>
      slide.items.filter((item) => item.type === 'zitat')
    );
    if (!zitate.length) {
      errors.push(
        'Der Auftrag ist ein Zitat: nimm ein zitat-Element mit text (wörtlich) und name (die Person aus dem Auftrag) – keine headline.'
      );
    }
    for (const zitat of zitate) {
      if (!given.includes(zitat.name)) {
        errors.push(
          `Der Name "${zitat.name}" steht nicht im Auftrag – nimm die Person, die dort als Sprecher*in genannt ist.`
        );
      }
    }
  }
  base.value.slides.forEach((slide) => {
    for (const item of slide.items) {
      if (item.type === 'zitat' && item.quelle && !sourceInBrief(item.quelle, given)) {
        errors.push(
          `Die Quelle "${item.quelle}" steht nicht im Auftrag – Quelle nur angeben, wenn der Auftrag das Medium nennt.`
        );
      }
    }
  });
  const givenDigits = new Set((given.match(NUMBER) ?? []).map(digits));
  base.value.slides.forEach((slide, s) => {
    const where = base.value.slides.length > 1 ? `Slide ${s + 1}: ` : '';
    if (slide.background.kind !== 'farbe' && !hasStockPhoto(slide.background.filename)) {
      errors.push(
        `${where}Foto "${slide.background.filename}" gibt es nicht — filename aus den Suchergebnissen übernehmen oder eine Farbe nehmen.`
      );
    }
    // In a carousel the figures carry the argument — they belong large.
    if (base.value.slides.length > 1) {
      for (const item of slide.items) {
        if (item.type === 'text' && /\d/.test(item.text)) {
          errors.push(
            `${where}"${item.text}" ist zu klein für eine Zahl – setz sie als headline oder absatz.`
          );
        }
      }
    }
    for (const text of textsOf(slide)) {
      if (hasUnpairedAccentMark(text)) {
        errors.push(
          `${where}"${text}" enthält ein einzelnes == – Hervorhebungen immer als ==Wort== paaren, ohne Leerzeichen innen.`
        );
      }
      const match = text.match(NO_CONTACT);
      if (match && !given.includes(match[0])) {
        errors.push(
          `${where}"${text}" enthält eine Adresse, die nicht im Auftrag steht. Weglassen.`
        );
      }
      const invented = (text.match(NUMBER) ?? []).filter((n) => !givenDigits.has(digits(n)));
      if (invented.length) {
        errors.push(
          `${where}"${text}" nennt ${invented.join(', ')} – diese Zahl steht nicht im Auftrag. Ohne Zahl formulieren.`
        );
      }
    }
  });
  return errors.length ? { ok: false, error: errors.join(' ') } : base;
}

const NEEDS_SCHEMA = {
  type: 'object',
  properties: {
    land: {
      type: 'string',
      enum: ['de-DE', 'de-AT'],
      description:
        'Für welches Land: Corporate Design der deutschen oder der österreichischen Grünen',
    },
    anlass: {
      type: 'array',
      items: { type: 'string', enum: [...EXAMPLE_OCCASIONS] },
      description: 'Welche Beispiel-Sharepics passen (1–2)',
    },
    kapitel: { type: 'array', items: { type: 'string', enum: Object.keys(STYLEGUIDE_CHAPTERS) } },
    fotos_suchen: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Englische Suchbegriffe für Stockfotos (bei Karussells auch mehrere), leer wenn kein Foto',
    },
  },
  required: ['land', 'anlass', 'kapitel', 'fotos_suchen'],
};

const SLIDE_SCHEMA = {
  type: 'object',
  properties: {
    background: {
      type: 'object',
      description:
        '{"kind":"farbe","color"} | {"kind":"foto","filename","textSeite":"unten"|"oben"|"links"|"rechts"} | {"kind":"foto-oben","filename","panelColor"} | {"kind":"foto-unten","filename","panelColor"}',
    },
    position: { type: 'string', enum: ['oben', 'mitte', 'unten'] },
    align: { type: 'string', enum: ['links', 'zentriert'] },
    items: {
      type: 'array',
      description:
        'Der Textblock in Lesereihenfolge: {"type":"dachzeile","text"} | {"type":"headline","lines":[…],"akzent"?:Zeilenindex oder [Indizes]} | {"type":"absatz","text","betont"?:true} | {"type":"text","text"} | {"type":"zitat","text","name","funktion"?,"quelle"?} | {"type":"frage","text","von"?} | {"type":"liste","items":[…]} | {"type":"button","text"}. Einzelne Wörter mit ==…== hervorheben.',
      items: { type: 'object' },
    },
    stoerer: { type: 'object', description: '{"text"} oder weglassen' },
    datum: { type: 'object', description: '{"weekday","date","time"} oder weglassen' },
    ort: { type: 'object', description: '{"lines":[…]} oder weglassen' },
    quelle: { type: 'string', description: 'Quelle einer Zahl, nur wenn sie im Auftrag steht' },
    zeilenboxen: { type: 'boolean', description: 'nur Deutschland: jede Zeile in einer Box' },
    logo: { type: 'boolean' },
  },
  required: ['background', 'position', 'align', 'items', 'logo'],
};

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    slides: {
      type: 'array',
      description: 'Eine Slide für ein Einzelbild, 3–8 für ein Karussell – in Wischreihenfolge.',
      items: SLIDE_SCHEMA,
    },
  },
  required: ['slides'],
};

function describePhotos(photos: StockPhoto[]): string {
  return photos.map((p) => `- ${p.filename}: ${p.alt_text}`).join('\n');
}

export class DraftFailedError extends Error {}

/** The model sees the draft without the country — that is decided, not designed. */
function withoutLocale(spec: SharepicSpec): Omit<SharepicSpec, 'locale'> {
  const { locale: _locale, ...rest } = spec;
  return rest;
}

/**
 * `defaultLocale` is the user's profile country; the model may switch it when
 * the request clearly belongs to the other country. A revision keeps the
 * draft's country.
 */
export async function draftSharepic(
  prompt: string,
  defaultLocale: SharepicCreatorLocale,
  current: SharepicSpec | null = null
): Promise<SharepicDraftResponse> {
  const fixed = current?.locale ?? null;
  const countryHint = fixed
    ? `Land: ${fixed} (steht fest).`
    : `Land: Standard ist ${defaultLocale} (Profil der Person). Nimm das andere Land nur, wenn der Auftrag eindeutig dorthin gehört — Orte, Landesorganisationen, typische Begriffe („Gemeinderat in Graz“ → de-AT, „Kreistag in Bayern“ → de-DE).`;
  // A revision keeps the draft and changes only what was asked for.
  const task = current
    ? `Aktueller Entwurf:\n${JSON.stringify(withoutLocale(current))}\n\nÄnderungswunsch:\n${prompt}`
    : `Auftrag:\n${prompt}`;
  const build = current
    ? 'Ändere den Entwurf wie gewünscht und gib ihn vollständig mit entwurf_abgeben ab. Lass alles andere unverändert.'
    : 'Baue jetzt das Sharepic – eine Slide oder ein Karussell – und gib es mit entwurf_abgeben ab.';

  const needs = await aiObject<Needs>({
    lane: 'sharepic_creator',
    pinned: PINNED,
    system: systemPrompt(fixed ?? defaultLocale),
    prompt: `${task}\n\n${countryHint}\n\nBevor du baust: Einzelbild oder Karussell? Für welches Land, welche Beispiele und Kapitel brauchst du, und wonach soll gesucht werden?`,
    toolName: 'bedarf_melden',
    toolDescription: 'Melde Land, passende Beispiele, Kapitel und die Suchbegriffe für ein Foto.',
    schema: NEEDS_SCHEMA,
    validate: (input) => fromZod(needsSchema, input),
    maxOutputTokens: 800,
    label: 'sharepicCreator:needs',
  });
  if (!needs.ok) throw new DraftFailedError(needs.error);
  log.info(`needs ${JSON.stringify(needs.data)}`);
  const locale = fixed ?? needs.data.land;

  const chapters = [...new Set(needs.data.kapitel)] as StyleguideChapter[];
  const photos = [
    ...new Map(
      needs.data.fotos_suchen.flatMap((q) => searchStockPhotos(q)).map((p) => [p.filename, p])
    ).values(),
  ];

  const context = [
    basicsText(locale),
    ...chapters.map(chapterText),
    examplesText(locale, [...new Set(needs.data.anlass)]),
    needs.data.fotos_suchen.length
      ? photos.length
        ? `## Gefundene Fotos (filename: Motiv)\n${describePhotos(photos)}`
        : '## Gefundene Fotos\nKein Foto passt zum Thema. Nimm eine Markenfarbe als Hintergrund (kein Foto).'
      : '',
  ].filter(Boolean);

  const draft = await aiObject<SharepicSpec>({
    lane: 'sharepic_creator',
    pinned: PINNED,
    system: `${systemPrompt(locale)}\n\n${context.join('\n\n')}`,
    prompt: `${task}\n\n${build}`,
    toolName: 'entwurf_abgeben',
    toolDescription: 'Gib den fertigen Sharepic-Entwurf ab.',
    schema: SPEC_SCHEMA,
    // Contact data already on the draft counts as given.
    validate: (input) =>
      validateDraft(input, locale, current ? `${prompt}\n${JSON.stringify(current)}` : prompt),
    attempts: 3,
    // A carousel of up to eight slides.
    maxOutputTokens: 5000,
    label: 'sharepicCreator:draft',
  });
  if (!draft.ok) throw new DraftFailedError(draft.error);

  const spec = draft.data;
  return {
    spec,
    chapters,
    attributions: spec.slides.map((slide) => {
      const credit =
        slide.background.kind !== 'farbe' ? getAttribution(slide.background.filename) : null;
      return credit
        ? {
            photographer: credit.photographer,
            profileUrl: credit.profileUrl,
            photoUrl: credit.photoUrl,
          }
        : null;
    }),
  };
}
