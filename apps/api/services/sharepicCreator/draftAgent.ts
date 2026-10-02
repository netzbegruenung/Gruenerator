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
  type SharepicSpec,
  sharepicCreatorLocaleSchema,
  sharepicSpecSchema,
} from '@gruenerator/contracts';
import { z } from 'zod';

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

const PINNED = { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model };

const needsSchema = z.object({
  land: sharepicCreatorLocaleSchema,
  anlass: z.array(exampleOccasionSchema).max(2),
  kapitel: z.array(styleguideChapterSchema).max(Object.keys(STYLEGUIDE_CHAPTERS).length),
  fotos_suchen: z.array(z.string().trim().min(2)).max(3),
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

function textsOf(spec: SharepicSpec): string[] {
  const texts = spec.items.flatMap((item) => {
    switch (item.type) {
      case 'headline':
        return item.lines;
      case 'liste':
        return item.items;
      case 'zitat':
        return [item.text, item.name, item.funktion ?? ''];
      default:
        return [item.text];
    }
  });
  if (spec.stoerer) texts.push(spec.stoerer.text);
  if (spec.ort) texts.push(...spec.ort.lines);
  return texts;
}

/** Schema plus everything the schema cannot know: catalog ids and invented contact data. */
export function validateDraft(
  input: unknown,
  locale: SharepicCreatorLocale,
  given: string
): StructuredValidation<SharepicSpec> {
  const base = fromZod(sharepicSpecSchema, { ...(input as object), locale });
  if (!base.ok) return base;
  const spec = base.value;
  const errors: string[] = [];
  if (spec.background.kind !== 'farbe' && !hasStockPhoto(spec.background.filename)) {
    errors.push(
      `Foto "${spec.background.filename}" gibt es nicht — filename aus den Suchergebnissen übernehmen oder eine Farbe nehmen.`
    );
  }
  for (const text of textsOf(spec)) {
    const match = text.match(NO_CONTACT);
    if (match && !given.includes(match[0])) {
      errors.push(`"${text}" enthält eine Adresse, die nicht im Auftrag steht. Weglassen.`);
    }
  }
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
      description: 'Englische Suchbegriffe für ein Stockfoto, leer wenn kein Foto',
    },
  },
  required: ['land', 'anlass', 'kapitel', 'fotos_suchen'],
};

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    background: {
      type: 'object',
      description:
        '{"kind":"farbe","color"} | {"kind":"foto","filename","textSeite":"unten"|"oben"|"links"|"rechts"} | {"kind":"foto-oben","filename","panelColor"}',
    },
    position: { type: 'string', enum: ['oben', 'mitte', 'unten'] },
    align: { type: 'string', enum: ['links', 'zentriert'] },
    items: {
      type: 'array',
      description:
        'Der Textblock in Lesereihenfolge: {"type":"dachzeile","text"} | {"type":"headline","lines":[…],"akzent"?:Zeilenindex} | {"type":"text","text"} | {"type":"zitat","text","name","funktion"?} | {"type":"liste","items":[…]} | {"type":"button","text"}',
      items: { type: 'object' },
    },
    stoerer: { type: 'object', description: '{"text"} oder weglassen' },
    datum: { type: 'object', description: '{"weekday","date","time"} oder weglassen' },
    ort: { type: 'object', description: '{"lines":[…]} oder weglassen' },
    logo: { type: 'boolean' },
    pfeil: { type: 'boolean' },
  },
  required: ['background', 'position', 'align', 'items', 'logo', 'pfeil'],
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
    : 'Baue jetzt das Sharepic und gib es mit entwurf_abgeben ab.';

  const needs = await aiObject<Needs>({
    lane: 'sharepic_creator',
    pinned: PINNED,
    system: systemPrompt(fixed ?? defaultLocale),
    prompt: `${task}\n\n${countryHint}\n\nBevor du baust: Für welches Land, welche Beispiele und Kapitel brauchst du, und wonach soll gesucht werden?`,
    toolName: 'bedarf_melden',
    toolDescription: 'Melde Land, passende Beispiele, Kapitel und die Suchbegriffe für ein Foto.',
    schema: NEEDS_SCHEMA,
    validate: (input) => fromZod(needsSchema, input),
    maxOutputTokens: 800,
    label: 'sharepicCreator:needs',
  });
  if (!needs.ok) throw new DraftFailedError(needs.error);
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
        : '## Gefundene Fotos\nKein Treffer — nimm eine Markenfarbe.'
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
    maxOutputTokens: 2000,
    label: 'sharepicCreator:draft',
  });
  if (!draft.ok) throw new DraftFailedError(draft.error);

  const spec = draft.data;
  const attribution =
    spec.background.kind !== 'farbe' ? getAttribution(spec.background.filename) : null;
  return {
    spec,
    chapters,
    attribution: attribution
      ? {
          photographer: attribution.photographer,
          profileUrl: attribution.profileUrl,
          photoUrl: attribution.photoUrl,
        }
      : null,
  };
}
