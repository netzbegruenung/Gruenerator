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
  isSharepicSceneRef,
  isSharepicUploadId,
  SHAREPIC_LOCALE_COLORS,
  type SharepicCreatorLocale,
  type SharepicDraftResponse,
  type SharepicOwnPhoto,
  type SharepicSlide,
  type SharepicSpec,
  sharepicCreatorLocaleSchema,
  sharepicFormatSchema,
  sharepicIconSchema,
  sharepicSpecSchema,
  sharepicTextSideSchema,
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
import { type IllustrationPainter } from './illustrations.js';
import { ownPhotosText } from './photoAnalysis.js';
import { type ScenePainter } from './sceneBackground.js';
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

export function textsOf(slide: SharepicSlide): string[] {
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
      case 'faktencheck':
        return item.paare.flatMap((p) => [p.mythos, p.fakt]);
      case 'zitat':
        return [item.text, item.name, item.funktion ?? '', item.quelle ?? ''];
      case 'frage':
        return [item.text, item.von ?? ''];
      case 'infografik':
        return item.punkte.flatMap((p) => [p.titel, p.text ?? '']);
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

/**
 * A fact check's correction may be reworded, not invented: most of its
 * content words (four letters and up, matched on their first five so
 * „Regionalbusse“ finds „Regionalbussen“) must stand in the brief.
 */
const FOUNDED_SHARE = 0.6;
function foundedInBrief(fakt: string, givenWords: string[]): boolean {
  const stem = (w: string) => w.slice(0, 5);
  const stems = new Set(givenWords.map(stem));
  const content = wordsOf(fakt).filter((w) => w.length >= 4);
  if (!content.length) return true;
  return content.filter((w) => stems.has(stem(w))).length >= content.length * FOUNDED_SHARE;
}

/** Every name token of 2+ letters ("S. Moser" → Moser) must stand in the brief as a whole word. */
function nameInBrief(name: string, givenWords: Set<string>): boolean {
  const tokens = wordsOf(name).filter((w) => w.length >= 2);
  return tokens.length > 0 && tokens.every((w) => givenWords.has(w));
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
/** `3.300` and `3300` are the same number — compare digits only. */
const digits = (value: string) => value.replace(/[.,]/g, '');

/**
 * Small numbers a poll spells out — „Neun von zehn“, „jedes fünfte Kind“,
 * „ein Drittel“. They count only for a share (`anteil`): everywhere else
 * „jeden Tag“ or „wir achten“ would license a 1 or an 8 nobody gave.
 * Ordinals and fractions name the whole; „jede“, „ein Drittel“ and „die
 * Hälfte“ the part one.
 */
const FRACTION = '(?:dritt|viert|fünft|sechst|siebt|acht|neunt|zehnt)el';
const SPELLED: [RegExp, number][] = (
  [
    [`eins|jede[mnrs]?|hälfte|ein(?:e[mnrs]?)?\\s+von|ein\\s+${FRACTION}`, 1],
    ['zwei|hälfte|zweite[mnrs]?', 2],
    ['drei|dritte[lmnrs]?', 3],
    ['vier|vierte[lmnrs]?', 4],
    ['fünf|fünfte[lmnrs]?', 5],
    ['sechs|sechste[lmnrs]?', 6],
    ['sieben|siebte[lmnrs]?', 7],
    ['acht|achte[lmnrs]?', 8],
    ['neun|neunte[lmnrs]?', 9],
    ['zehn|zehnte[lmnrs]?', 10],
  ] as const
).map(([words, n]) => [new RegExp(`(?<!\\p{L})(?:${words})(?!\\p{L})`, 'u'), n]);
export function spelledNumbers(text: string): string[] {
  const lower = text.toLowerCase();
  return SPELLED.filter(([word]) => word.test(lower)).map(([, n]) => String(n));
}

/** Clock times as [hour, minutes]: „10 Uhr“, „18h“, „18.30 Uhr“, „20 Uhr 30“, „18:30“ — not „14.11.“ */
function clockTimes(text: string): [number, number][] {
  const times: [number, number][] = [];
  const re =
    /(?<![\d.:])(?:(\d{1,2})\s*[–-]\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:Uhr|h)(?!\p{L})(?:\s{1,3}(\d{2})(?![\d:]|\.\d))?|(?<![\d.:])(\d{1,2}):(\d{2})(?![\d:])/giu;
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) times.push([Number(m[1]), 0]);
    times.push(
      m[2] !== undefined ? [Number(m[2]), Number(m[3] ?? m[4] ?? 0)] : [Number(m[5]), Number(m[6])]
    );
  }
  return times;
}

/** Own extraction, `digits()` would collapse „18.30“ to „1830“; a time only in words is skipped. */
function timeInBrief(time: string, given: string): boolean {
  const stated = clockTimes(given);
  if (
    !stated.length &&
    /\p{L}{1,20}\s{1,3}Uhr(?!\p{L})|\b(?:halb|viertel|dreiviertel)\s+\p{L}/iu.test(given)
  ) {
    return true;
  }
  const parsed = /(\d{1,2})(?:[:.](\d{2}))?/.exec(time);
  const first = parsed && [Number(parsed[1]), Number(parsed[2] ?? 0)];
  if (!first) return true;
  return stated.some(([h, m]) => h === first[0] && (first[1] === 0 || m === first[1]));
}

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
  uploadIds: readonly string[] = [],
  /** The `ki:` scenes this draft may show — painted earlier, or about to be. */
  sceneRefs: readonly string[] = []
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
    // „Quelle: Auftrag" came back once — a source line only names what the brief names.
    if (slide.quelle && !sourceInBrief(slide.quelle, given)) {
      errors.push(
        `Die Quelle "${slide.quelle}" steht nicht im Auftrag – quelle weglassen, wenn der Auftrag keine Quelle nennt.`
      );
    }
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
  // A share may also come spelled out; only its own numbers may use that.
  const givenShare = new Set([...givenDigits, ...spelledNumbers(given)]);
  const givenPercent = /%|prozent/i.test(given);
  const briefWords = [...new Set(wordsOf(given))];
  base.value.slides.forEach((slide, s) => {
    const where = base.value.slides.length > 1 ? `Slide ${s + 1}: ` : '';
    if (slide.background.kind !== 'farbe') {
      const { filename } = slide.background;
      const known = isSharepicUploadId(filename)
        ? uploadIds.includes(filename)
        : isSharepicSceneRef(filename)
          ? sceneRefs.includes(filename)
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
    if (slide.datum?.time !== undefined && !timeInBrief(slide.datum.time, given)) {
      errors.push(
        `${where}datum.time "${slide.datum.time}" steht nicht im Auftrag – time weglassen, wenn der Auftrag keine Uhrzeit nennt.`
      );
    }
    if (slide.datum?.date !== undefined) {
      const { date, time } = slide.datum;
      const squash = (v: string) => v.toLowerCase().replace(/\s+/g, '').replace(/\.$/, '');
      const clock = /^(\d{1,2})[.:]\d{2}$/.exec(squash(date));
      const hour = time === undefined ? null : /\d{1,2}/.exec(time)?.[0];
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
    const shareTitles = new Set<string>();
    for (const item of slide.items) {
      if (item.type !== 'infografik') continue;
      const known = item.form === 'anteil' ? givenShare : givenDigits;
      if (item.form === 'anteil') for (const p of item.punkte) shareTitles.add(p.titel);
      const invented = item.punkte.filter(
        (p) => p.wert !== undefined && !known.has(digits(String(p.wert)))
      );
      if (invented.length) {
        errors.push(
          `${where}wert ${invented.map((p) => `${p.wert} (${p.titel})`).join(', ')} steht nicht im Auftrag – nur Zahlen aus dem Auftrag, nichts umrechnen.`
        );
      }
      // The whole of a share: named in the brief, or 100 for a percentage.
      const wholes = item.punkte.filter(
        (p) => p.von !== undefined && !known.has(String(p.von)) && !(p.von === 100 && givenPercent)
      );
      if (wholes.length) {
        errors.push(
          `${where}von ${wholes.map((p) => `${p.von} (${p.titel})`).join(', ')} steht nicht im Auftrag – „9 von 10“ nur, wenn der Auftrag es so sagt; Prozent zählen von 100.`
        );
      }
      const unknown = item.punkte.filter((p) => p.bild && !sceneRefs.includes(p.bild));
      if (unknown.length) {
        errors.push(
          `${where}bild schreibt der Grünerator selbst – lass das Feld weg und beschreibe in motiv, was gemalt werden soll.`
        );
      }
    }
    for (const item of slide.items) {
      if (item.type !== 'faktencheck') continue;
      // A carousel swipes from claim to claim: one pair per slide.
      if (base.value.slides.length > 1 && item.paare.length > 1) {
        errors.push(
          `${where}Im Karussell steht ein Mythos-Fakt-Paar pro Slide – verteile die ${item.paare.length} Paare auf eigene Slides.`
        );
      }
      const unfounded = item.paare.filter((p) => !foundedInBrief(p.fakt, briefWords));
      if (unfounded.length) {
        errors.push(
          `${where}Der Fakt "${unfounded[0]!.fakt}" stützt sich nicht auf den Auftrag – nur Richtigstellungen, die der Auftrag nennt, mit seinen Worten. Nennt er keine, kein faktencheck.`
        );
      }
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
      const known = shareTitles.has(text) ? givenShare : givenDigits;
      const invented = (text.match(NUMBER) ?? []).filter((n) => !known.has(digits(n)));
      if (invented.length) {
        errors.push(
          `${where}"${text}" nennt ${invented.join(', ')} – diese Zahl steht nicht im Auftrag. Ohne Zahl formulieren.`
        );
      }
    }
  });
  return errors.length ? { ok: false, error: errors.join(' ') } : base;
}

/** Stands in for the scene while the draft is checked; replaced by the painted image. */
export const SCENE_PENDING = 'ki:szene-wird-gemalt';

const sceneSchema = z.object({
  kind: z.literal('szene'),
  motiv: z.string().trim().min(10).max(300),
  textSeite: sharepicTextSideSchema,
});

export interface DraftScene {
  slide: number;
  motiv: string;
}

const INFOGRAPHIC = /infogra(?:fik|phic)/i;
const FAKTENBILD = /faktenbild/i;

/**
 * Takes the `szene` background out of a draft: the schema only knows photos,
 * so the scene goes through validation as a photo with a placeholder ref, and
 * its description waits for the painter. One scene per draft — it costs trees
 * and half a minute.
 */
export function takeScene(
  input: unknown
): { ok: true; input: unknown; scene: DraftScene | null } | { ok: false; error: string } {
  const slides = (input as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides)) return { ok: true, input, scene: null };
  const at = slides.flatMap((slide: unknown, i) =>
    (slide as { background?: { kind?: unknown } } | null)?.background?.kind === 'szene' ? [i] : []
  );
  if (!at.length) return { ok: true, input, scene: null };
  if (at.length > 1) {
    return {
      ok: false,
      error: `Höchstens eine szene pro Entwurf (Slides ${at.map((i) => i + 1).join(', ')}) – die anderen Slides bekommen eine Farbe oder ein Foto.`,
    };
  }
  const index = at[0]!;
  const parsed = sceneSchema.safeParse((slides[index] as { background: unknown }).background);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Slide ${index + 1}: szene braucht "motiv" (Englisch, 10–300 Zeichen, nur die Szene – kein Text, keine Zahlen) und "textSeite".`,
    };
  }
  const { motiv, textSeite } = parsed.data;
  const next = slides.map((slide: unknown, i) =>
    i === index
      ? {
          ...(slide as object),
          background: { kind: 'foto', filename: SCENE_PENDING, textSeite },
        }
      : slide
  );
  return {
    ok: true,
    input: { ...(input as object), slides: next },
    scene: { slide: index, motiv },
  };
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
        '{"kind":"farbe","color"} | {"kind":"foto","filename","textSeite":"unten"|"oben"|"links"|"rechts"} | {"kind":"foto-oben","filename","panelColor"} | {"kind":"foto-unten","filename","panelColor"} | {"kind":"szene","motiv","textSeite"} (filename: Stockfoto-Datei, id eines eigenen Fotos wie "upload:1" oder ein schon gemalter Hintergrund "ki:…"; szene: ein neu gemalter Hintergrund nur für ein Faktenbild, motiv auf Englisch, nur die Szene)',
    },
    position: { type: 'string', enum: ['oben', 'mitte', 'unten'] },
    align: { type: 'string', enum: ['links', 'zentriert'] },
    items: {
      type: 'array',
      description: `Der Textblock in Lesereihenfolge: {"type":"dachzeile","text"} | {"type":"headline","lines":[…],"akzent"?:Zeilenindex oder [Indizes]} | {"type":"absatz","text","betont"?:true} | {"type":"text","text"} | {"type":"zitat","text","name","funktion"?,"quelle"?} | {"type":"frage","text","von"?} | {"type":"liste","items":[…]} | {"type":"iconliste","zeilen":[{"icon","text"}, …2–4]} | {"type":"vergleich","links":{"titel","punkte":[…2–3]},"rechts":{"titel","punkte":[…2–3]}} (links der Plan der anderen, rechts unserer) | {"type":"faktencheck","paare":[{"mythos","fakt"}, …1–3]} (eine verbreitete Behauptung und ihre Richtigstellung) | {"type":"button","text"} | {"type":"diagramm","art":"balken"|"balken-quer"|"linie"|"kreis"|"donut","werte":[{"name","wert":Zahl}, …1–8],"einheit"?:"%","titel"?} | {"type":"infografik","form":"raster"|"ablauf"|"mengen"|"anteil"|"zahl","punkte":[{"titel","text"?,"icon","motiv"?,"wert"?:Zahl bei mengen und anteil,"von"?:Ganzes nur bei anteil}, …2–6, anteil 1–3, zahl genau 1]} (motiv auf Englisch: ein Gegenstand, kein Text; anteil ohne motiv). Einzelne Wörter mit ==…== hervorheben; nur Deutschland: bis zu 2 Passagen in zitat, absatz oder headline mit ++…++ (Textmarker-Box). icon ist einer von: ${sharepicIconSchema.options.join(', ')}.`,
      items: { type: 'object' },
    },
    stoerer: { type: 'object', description: '{"text"} oder weglassen' },
    datum: {
      type: 'object',
      description:
        '{"weekday","date"?,"time"?} oder weglassen; date und time nur, wenn der Auftrag sie nennt',
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
    format: {
      type: 'string',
      enum: sharepicFormatSchema.options,
      description:
        '"post-portrait-tall" (3:4) nur, wenn der Auftrag ausdrücklich 3:4 verlangt; sonst weglassen (4:5).',
    },
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

/**
 * Paints every infographic point that names a motive and has no picture yet.
 * Without a painter, or where painting fails, the point keeps its icon.
 */
async function paintIllustrations(
  spec: SharepicSpec,
  painter: IllustrationPainter | undefined
): Promise<{ spec: SharepicSpec; hinweis: string | null }> {
  // Quantities compare one thing at different sizes: one painting serves
  // every point, so they cannot differ in anything but size.
  const wanted = spec.slides.flatMap((slide) =>
    slide.items.flatMap((item) => {
      // Pictogram rows are icons; nothing to paint.
      if (item.type !== 'infografik' || item.form === 'anteil') return [];
      const open = item.punkte.filter((p) => !p.bild);
      if (item.form === 'mengen') {
        const motiv = open.find((p) => p.motiv)?.motiv;
        return motiv ? [{ motiv, punkte: open }] : [];
      }
      return open.flatMap((p) => (p.motiv ? [{ motiv: p.motiv, punkte: [p] }] : []));
    })
  );
  if (!wanted.length || !painter) return { spec, hinweis: null };
  const { refs, hinweis } = await painter(
    wanted.map((w) => w.motiv),
    spec.locale
  );
  const painted = new Map(
    wanted.flatMap((w, k) => w.punkte.map((p) => [p, refs[k] ?? null] as const))
  );
  return {
    hinweis,
    spec: {
      ...spec,
      slides: spec.slides.map((slide) => ({
        ...slide,
        items: slide.items.map((item) =>
          item.type !== 'infografik'
            ? item
            : {
                ...item,
                punkte: item.punkte.map((p) => {
                  const ref = painted.get(p);
                  return ref ? { ...p, bild: ref } : p;
                }),
              }
        ),
      })),
    },
  };
}

export interface SharepicPainters {
  /** Paints a Faktenbild's `szene` background (FLUX 3). */
  scene?: ScenePainter;
  /** Paints an infographic's illustrations (FLUX.2 [klein]). */
  illustrations?: IllustrationPainter;
}

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
  ownPhotos: readonly SharepicOwnPhoto[] = [],
  /** Without them (no user) a scene becomes a colour and an illustration an icon. */
  painters: SharepicPainters = {}
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

  // Images painted for this draft before stay usable in a revision.
  const keptScenes = (current?.slides ?? []).flatMap((slide) => [
    ...(slide.background.kind !== 'farbe' && isSharepicSceneRef(slide.background.filename)
      ? [slide.background.filename]
      : []),
    ...slide.items.flatMap((item) =>
      item.type === 'infografik' ? item.punkte.flatMap((p) => (p.bild ? [p.bild] : [])) : []
    ),
  ]);
  // A Faktenbild always gets a painted scene; an infographic always is one.
  const wantsScene = painters.scene !== undefined && !current && FAKTENBILD.test(prompt);
  const wantsInfografik = !current && INFOGRAPHIC.test(prompt);

  const draft = await aiObject<{ spec: SharepicSpec; scene: DraftScene | null }>({
    lane: 'sharepic_creator',
    pinned: PINNED,
    system: `${systemPrompt(locale)}\n\n${context.join('\n\n')}`,
    prompt: `${task}\n\n${build}`,
    toolName: 'entwurf_abgeben',
    toolDescription: 'Gib den fertigen Sharepic-Entwurf ab.',
    schema: SPEC_SCHEMA,
    validate: (input) => {
      const taken = takeScene(input);
      if (!taken.ok) return taken;
      if (wantsScene && !taken.scene) {
        return {
          ok: false,
          error:
            'Der Auftrag ist ein Faktenbild: eine Slide (Einzelbild: die Slide, Karussell: das Cover) bekommt background {"kind":"szene","motiv","textSeite"} – motiv auf Englisch, nur die Szene zum Thema, kein Text und keine Zahlen.',
        };
      }
      const slides = (taken.input as { slides?: { items?: { type?: unknown }[] }[] }).slides;
      if (
        wantsInfografik &&
        !slides?.some((slide) => slide.items?.some((item) => item.type === 'infografik'))
      ) {
        return {
          ok: false,
          error:
            'Der Auftrag ist eine Infografik: setz die Punkte als {"type":"infografik","form","punkte":[…]} – mit icon und motiv je Punkt (Kapitel infografik).',
        };
      }
      // Contact data already on the draft counts as given.
      const checked = validateDraft(
        taken.input,
        locale,
        current ? `${prompt}\n${JSON.stringify(current)}` : prompt,
        ownPhotos.map((p) => p.id),
        taken.scene ? [SCENE_PENDING, ...keptScenes] : keptScenes
      );
      return checked.ok
        ? { ok: true, value: { spec: checked.value, scene: taken.scene } }
        : checked;
    },
    attempts: 3,
    // A carousel of up to eight slides.
    maxOutputTokens: 5000,
    label: 'sharepicCreator:draft',
  });
  if (!draft.ok) throw new DraftFailedError(draft.error);

  // A revision keeps the draft's format unless the model names one.
  const drafted = draft.data.spec;
  let spec = current?.format && !drafted.format ? { ...drafted, format: current.format } : drafted;
  let hinweis: string | null = null;
  const scene = draft.data.scene;
  if (scene) {
    const background = spec.slides[scene.slide]!.background;
    const textSeite = background.kind === 'foto' ? background.textSeite : 'unten';
    const painted = painters.scene
      ? await painters.scene({ motiv: scene.motiv, textSeite, format: spec.format })
      : ({ ok: false, hinweis: null } as const);
    if (!painted.ok) hinweis = painted.hinweis;
    spec = {
      ...spec,
      slides: spec.slides.map((slide, i) =>
        i !== scene.slide
          ? slide
          : painted.ok
            ? { ...slide, background: { kind: 'foto', filename: painted.ref, textSeite } }
            : {
                ...slide,
                // The block sat beside the scene; on a plain colour it belongs in the middle.
                position: 'mitte',
                background: { kind: 'farbe', color: SHAREPIC_LOCALE_COLORS[spec.locale][0]! },
              }
      ),
    };
  }
  const illustrated = await paintIllustrations(spec, painters.illustrations);
  spec = illustrated.spec;
  hinweis = hinweis ?? illustrated.hinweis;
  return {
    spec,
    ...(hinweis && { hinweis }),
    chapters,
    attributions: spec.slides.map((slide) => {
      const credit =
        slide.background.kind !== 'farbe' &&
        !isSharepicUploadId(slide.background.filename) &&
        !isSharepicSceneRef(slide.background.filename)
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
