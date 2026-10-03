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
  isSharepicUploadId,
  type SharepicCreatorLocale,
  type SharepicDraftResponse,
  type SharepicOwnPhoto,
  type SharepicSlide,
  type SharepicSpec,
  sharepicCreatorLocaleSchema,
  sharepicIconSchema,
  sharepicSpecSchema,
  countMarkerPassages,
  hasUnpairedAccentMark,
  SHAREPIC_MARKER_PASSAGES,
  tightenAccentMarksDeep,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { GEMMA_31B_ON_MELIOUS } from '../ai/gemmaHosts.js';
import { aiObject } from '../ai/generate.js';
import { getAttribution } from '../image/UnsplashAttributionService.js';

import { hasStockPhoto, searchStockPhotos, type StockPhoto } from './catalog.js';
import { ownPhotosText } from './photoAnalysis.js';
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

const NO_CONTACT =
  /(https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,}|\b[\w-]+\.(?:de|at|net|com|eu|org)\b)/i;

function textsOf(slide: SharepicSlide): string[] {
  const texts = slide.items.flatMap((item) => {
    switch (item.type) {
      case 'headline':
        return item.lines;
      case 'liste':
        return item.items;
      case 'iconliste':
        return item.zeilen.map((z) => z.text);
      case 'vergleich':
        return [item.links, item.rechts].flatMap((side) => [side.titel, ...side.punkte]);
      case 'zitat':
        return [item.text, item.name, item.funktion ?? '', item.quelle ?? ''];
      case 'frage':
        return [item.text, item.von ?? ''];
      // The values are checked on their own, with a repair hint that fits a chart.
      case 'diagramm':
        return [item.titel ?? '', item.einheit ?? '', ...item.werte.map((w) => w.name)];
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
 * `++marker++` is the DE text-marker box: allowed on quote text, paragraphs and
 * headlines, at most twice per slide. AT never uses it (yellow `==accent==`
 * there; the composer folds a stray `++` into one).
 */
/** Every string inside a value (item, footer part). */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}
const hasMarker = (text: string) => countMarkerPassages(text) > 0;

function markerProblems(slide: SharepicSlide, locale: SharepicCreatorLocale, where: string) {
  const problems: string[] = [];
  let passages = 0;
  for (const item of slide.items) {
    const texts =
      item.type === 'headline'
        ? item.lines
        : item.type === 'zitat' || item.type === 'absatz'
          ? [item.text]
          : null;
    if (texts) passages += texts.reduce((n, t) => n + countMarkerPassages(t), 0);
    else if (stringsOf(item).some(hasMarker)) {
      problems.push(
        `${where}++…++ steht nur in zitat, absatz und headline – im Element "${item.type}" weglassen.`
      );
    }
  }
  if (stringsOf([slide.stoerer, slide.ort, slide.quelle]).some(hasMarker)) {
    problems.push(`${where}++…++ steht nur in zitat, absatz und headline.`);
  }
  if (locale === 'de-AT' && passages > 0) {
    problems.push(
      `${where}++…++ ist DE – für Österreich hervorgehobene Wörter als ==Wort== setzen.`
    );
  }
  if (passages > SHAREPIC_MARKER_PASSAGES) {
    problems.push(
      `${where}Höchstens ${SHAREPIC_MARKER_PASSAGES} Textmarker-Passagen ++…++ pro Slide, hier sind es ${passages}.`
    );
  }
  return problems;
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
  `(?:^|[\\s,])(?:(\\p{Ll}+)\\s+)?(${NAME_PAIR})(?:\\s*\\([^)]*\\))?\\s*:\\s*$`,
  'u'
);
/** "…“, sagt Sabine Moser", "…“ – Sabine Moser" */
const SPEAKER_AFTER_QUOTE = new RegExp(
  `^[\\s,.]*(?:(?:sagt|sagte|meint|betont|so|–|—)\\s+(${NAME_PAIR})|\\(\\s*(${NAME_PAIR})\\s*\\))`,
  'u'
);
const SPEAKER_AFTER_VON = new RegExp(`\\bvon\\s+(${NAME_PAIR})`, 'u');
/** "zur Grünen Woche:" — a noun phrase behind a preposition or article, not a person. */
const NOT_A_NAME_INTRO =
  /^(?:zu[rm]?|der|des|die|den|dem|im|in|bei|mit|für|auf|am|aus|nach|vom|ins|über|um|zum)$/;
/** A pair opening with an article or determiner ("Die Grünen", "Unsere Partei") is no person. */
const ARTICLE_FIRST = /^(?:die|der|das|den|dem|des|unsere|unser|alle)\s/i;
/** Second word of an event or thing ("Grüne Woche", "Klimagipfel", "Landtagswahl"), not a surname. */
const THING_SUFFIX = /(?:woche|tage?|wahl|konferenz|gipfel|markt|fest|partei|grünen)$/i;
/** "Grüne Wien", "Bündnis Grüne", "(Foto Archiv)": a party or a production note, whichever word it stands in. */
const PARTY_WORD = /^(?:grüne[nrs]?|bündnis|format|foto|bild|quelle|archiv|video|grafik)$/i;
function isPerson(pair: string): boolean {
  const words = pair.split(/\s+/);
  return (
    !ARTICLE_FIRST.test(pair) && !words.some((w) => THING_SUFFIX.test(w) || PARTY_WORD.test(w))
  );
}
export function namesSpeaker(given: string): boolean {
  const quoted = QUOTED_PASSAGE.exec(given);
  const quote = quoted ? quoted.index : -1;
  const before = (quote === -1 ? given : given.slice(0, quote)).replace(/\bZitat\b/g, ' ');
  if (quoted) {
    const after = SPEAKER_AFTER_QUOTE.exec(given.slice(quote + quoted[0].length));
    const pair = after ? (after[1] ?? after[2]) : '';
    if (pair && isPerson(pair)) return true;
  }
  const match = SPEAKER_BEFORE_QUOTE.exec(before.trimEnd());
  if (match && isPerson(match[2]) && !(match[1] && NOT_A_NAME_INTRO.test(match[1]))) return true;
  const von = SPEAKER_AFTER_VON.exec(before);
  return von !== null && isPerson(von[1]);
}

/** Words that say nothing about which medium a quote came from. */
const GENERIC_SOURCE_WORDS = new Set([
  'Interview',
  'Im',
  'In',
  'Mit',
  'Der',
  'Die',
  'Dem',
  'Das',
  'Auf',
]);

/** `quelle` may only name a medium the brief names — an invented one is a false attribution. */
function sourceInBrief(quelle: string, given: string): boolean {
  const outside = given.replace(new RegExp(QUOTED_PASSAGE, 'g'), ' ');
  const words = quelle.match(/\p{Lu}[\p{L}]*/gu) ?? [];
  return words.some((w) => w.length >= 2 && !GENERIC_SOURCE_WORDS.has(w) && outside.includes(w));
}

/**
 * Lowercased words without marks, quotes, punctuation and `[…]`/`…` cuts, so a
 * shortened or re-marked quote still matches the brief word by word (order is
 * not checked).
 */
function wordsOf(value: string): string[] {
  return value
    .replace(/\[(?:…|\.{3})\]|…/g, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
}

/** Every name token of 2+ letters ("S. Moser" → Moser) must stand in the brief as a whole word. */
function nameInBrief(name: string, givenWords: Set<string>): boolean {
  const tokens = wordsOf(name).filter((w) => w.length >= 2);
  return tokens.length > 0 && tokens.every((w) => givenWords.has(w));
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
/** `3.300` and `3300` are the same number — compare digits only. */
const digits = (value: string) => value.replace(/[.,]/g, '');

const MONTHS: Record<string, number> = {
  jan: 1,
  jän: 1,
  feb: 2,
  mär: 3,
  mrz: 3,
  apr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  okt: 10,
  nov: 11,
  dez: 12,
};
/**
 * Day and month of every date a text names, as `d.m` — „15. November",
 * „15. Nov." and „15.11." are the same day. AT „Jänner" and „Feber" count.
 */
function calendarDays(text: string): Set<string> {
  const days = new Set<string>();
  const add = (d: string, m: number) => {
    const day = Number(d);
    if (day >= 1 && day <= 31 && m >= 1 && m <= 12) days.add(`${day}.${m}`);
  };
  for (const [, d, m] of text.matchAll(/(\d{1,2})\.\s?(\d{1,2})\.?(?!\d)/g)) add(d!, Number(m));
  for (const [, d, name] of text.matchAll(/(\d{1,2})\.\s?([A-Za-zÄäÖöÜü]{3,})/g)) {
    const month =
      MONTHS[name!.toLowerCase().slice(0, 3)] ?? (name!.toLowerCase().startsWith('feber') ? 2 : 0);
    add(d!, month);
  }
  return days;
}

/**
 * Schema plus everything the schema cannot know: catalog ids, invented
 * contact data, and invented numbers — a critique carousel lives on its
 * figures, so every one of them must come from the request.
 */
export function validateDraft(
  input: unknown,
  locale: SharepicCreatorLocale,
  given: string,
  /** The `upload:N` ids this request brought along — no others exist. */
  uploadIds: readonly string[] = []
): StructuredValidation<SharepicSpec> {
  const base = fromZod(sharepicSpecSchema, {
    ...(tightenAccentMarksDeep(input) as object),
    locale,
  });
  if (!base.ok) return base;
  const errors: string[] = [];
  const zitate = base.value.slides.flatMap((slide) =>
    slide.items.filter((item) => item.type === 'zitat')
  );
  if (isQuoteBrief(given) && namesSpeaker(given) && !zitate.length) {
    errors.push(
      'Der Auftrag ist ein Zitat: nimm ein zitat-Element mit text (wörtlich) und name (die Person aus dem Auftrag) – keine headline.'
    );
  }
  // Any brief shape: a quote is attributed to a person, so both must come from the brief.
  const givenWords = new Set(wordsOf(given));
  for (const zitat of zitate) {
    if (!nameInBrief(zitat.name, givenWords)) {
      errors.push(
        `Der Name "${zitat.name}" steht nicht im Auftrag – nimm die Person, die dort als Sprecher*in genannt ist. Nennt der Auftrag keine Person, nimm absatz oder headline statt eines zitat.`
      );
    }
    const missing = wordsOf(zitat.text).filter((w) => !givenWords.has(w));
    if (missing.length) {
      errors.push(
        `Das Zitat "${zitat.text}" ist nicht wörtlich aus dem Auftrag (${missing.slice(0, 3).join(', ')} fehlt). Wortlaut übernehmen, Kürzen nur mit […].`
      );
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
  // An interview carousel ends by naming where the whole interview is — marked.
  const slides = base.value.slides;
  const last = slides[slides.length - 1];
  const interview =
    slides.length > 1 && slides.some((s) => s.items.some((item) => item.type === 'frage'));
  if (interview && last && !textsOf(last).some((text) => /==[^=]+==/.test(text))) {
    errors.push(
      `Slide ${slides.length}: Die letzte Slide eines Interviews nennt das Medium bzw. die Domain markiert – „Das ganze Interview im ==Kasseler Boten==“ oder „… auf ==domain.de==“ (nur, was im Auftrag steht).`
    );
  }
  const givenDigits = new Set((given.match(NUMBER) ?? []).map(digits));
  base.value.slides.forEach((slide, s) => {
    const where = base.value.slides.length > 1 ? `Slide ${s + 1}: ` : '';
    if (slide.background.kind !== 'farbe') {
      const { filename } = slide.background;
      const known = isSharepicUploadId(filename)
        ? uploadIds.includes(filename)
        : hasStockPhoto(filename);
      if (!known) {
        errors.push(
          `${where}Foto "${filename}" gibt es nicht — filename aus den Suchergebnissen oder eine id der eigenen Fotos übernehmen, sonst eine Farbe nehmen.`
        );
      }
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
    if (slide.datum?.date !== undefined) {
      const { date, time } = slide.datum;
      const squash = (v: string) => v.toLowerCase().replace(/\s+/g, '').replace(/\.$/, '');
      const clock = /^(\d{1,2})[.:]\d{2}$/.exec(squash(date));
      const hour = /\d{1,2}/.exec(time)?.[0];
      const named = calendarDays(date);
      const inBrief = named.size
        ? [...named].every((day) => calendarDays(given).has(day))
        : squash(given).includes(squash(date));
      // „10.00“ next to „10 Uhr“ is the time again, never a day — even if the brief has it.
      if (!named.size && clock && clock[1] === hour) {
        errors.push(
          `${where}datum.date "${date}" wiederholt die Uhrzeit "${time}" – date leer lassen bzw. weglassen; die Uhrzeit steht schon in time.`
        );
      } else if (!inBrief) {
        errors.push(
          `${where}datum.date "${date}" steht nicht im Auftrag – date leer lassen bzw. weglassen, wenn der Auftrag kein Datum nennt (Wochentag und Uhrzeit genügen).`
        );
      }
    }
    errors.push(...markerProblems(slide, locale, where));
    if (locale === 'de-AT' && slide.items.some((item) => item.type === 'button')) {
      errors.push(
        `${where}Österreich hat keine button-Pillen – den Aufruf als absatz oder in die headline schreiben.`
      );
    }
    for (const item of slide.items) {
      if (item.type !== 'diagramm') continue;
      const invented = item.werte.filter((w) => !givenDigits.has(digits(String(w.wert))));
      if (invented.length) {
        errors.push(
          `${where}Diagrammwert ${invented.map((w) => `${w.wert} (${w.name})`).join(', ')} steht nicht im Auftrag – nur Zahlen aus dem Auftrag als werte, nichts umrechnen. Fehlen sie, kein diagramm.`
        );
      }
    }
    for (const text of textsOf(slide)) {
      if (hasUnpairedAccentMark(text)) {
        errors.push(
          `${where}"${text}" enthält ein einzelnes == oder ++ – Hervorhebungen immer als ==Wort== bzw. ++Passage++ paaren, ohne Leerzeichen innen.`
        );
      }
      const match = text.match(NO_CONTACT);
      if (match && !given.toLowerCase().includes(match[0].toLowerCase())) {
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
        '{"kind":"farbe","color"} | {"kind":"foto","filename","textSeite":"unten"|"oben"|"links"|"rechts"} | {"kind":"foto-oben","filename","panelColor"} | {"kind":"foto-unten","filename","panelColor"} (filename: Stockfoto-Datei oder id eines eigenen Fotos, z. B. "upload:1")',
    },
    position: { type: 'string', enum: ['oben', 'mitte', 'unten'] },
    align: { type: 'string', enum: ['links', 'zentriert'] },
    items: {
      type: 'array',
      description: `Der Textblock in Lesereihenfolge: {"type":"dachzeile","text"} | {"type":"headline","lines":[…],"akzent"?:Zeilenindex oder [Indizes]} | {"type":"absatz","text","betont"?:true} | {"type":"text","text"} | {"type":"zitat","text","name","funktion"?,"quelle"?} | {"type":"frage","text","von"?} | {"type":"liste","items":[…]} | {"type":"iconliste","zeilen":[{"icon","text"}, …2–4]} | {"type":"vergleich","links":{"titel","punkte":[…2–3]},"rechts":{"titel","punkte":[…2–3]}} (links der Plan der anderen, rechts unserer) | {"type":"button","text"} | {"type":"diagramm","art":"balken"|"balken-quer"|"linie"|"kreis"|"donut","werte":[{"name","wert":Zahl}, …1–8],"einheit"?:"%","titel"?}. Einzelne Wörter mit ==…== hervorheben; nur Deutschland: bis zu 2 Passagen in zitat, absatz oder headline mit ++…++ (Textmarker-Box). icon ist einer von: ${sharepicIconSchema.options.join(', ')}.`,
      items: { type: 'object' },
    },
    stoerer: { type: 'object', description: '{"text"} oder weglassen' },
    datum: {
      type: 'object',
      description:
        '{"weekday","date"?,"time"} oder weglassen; date nur, wenn der Auftrag ein Datum nennt',
    },
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
  current: SharepicSpec | null = null,
  ownPhotos: readonly SharepicOwnPhoto[] = []
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
    prompt: `${task}${ownPhotos.length ? `\n\n${ownPhotosText(ownPhotos)}` : ''}\n\n${countryHint}\n\nBevor du baust: Einzelbild oder Karussell? Für welches Land, welche Beispiele und Kapitel brauchst du, und wonach soll gesucht werden?`,
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
    ownPhotos.length ? ownPhotosText(ownPhotos) : '',
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
      validateDraft(
        input,
        locale,
        current ? `${prompt}\n${JSON.stringify(current)}` : prompt,
        ownPhotos.map((p) => p.id)
      ),
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
        slide.background.kind !== 'farbe' && !isSharepicUploadId(slide.background.filename)
          ? getAttribution(slide.background.filename)
          : null;
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
