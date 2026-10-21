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
  isSharepicVorlageRef,
  SHAREPIC_LOCALE_COLORS,
  slidePhotoFilename,
  type SharepicCreatorLocale,
  type SharepicDraftFocus,
  type SharepicDraftResponse,
  type SharepicOwnPhoto,
  type SharepicItem,
  type SharepicSlide,
  type SharepicSpec,
  sharepicFormLabel,
  type SharepicFormId,
  sharepicSpecSchema,
  countMarkerPassages,
  hasUnpairedAccentMark,
  hasUnpairedHandMark,
  SHAREPIC_MARKER_PASSAGES,
  tightenAccentMarksDeep,
} from '@gruenerator/contracts';
import { type z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { GEMMA_31B_ON_MELIOUS } from '../ai/gemmaHosts.js';
import { aiObject, type AiObjectCall } from '../ai/generate.js';
import { getAttribution } from '../image/UnsplashAttributionService.js';

import {
  isQuoteBrief,
  namesSpeaker,
  spelledNumbers,
  sourceInBrief,
  wordsOf,
  foundedInBrief,
  nameInBrief,
  wordInBrief,
  briefWordsFor,
  NUMBER,
  digits,
  clockTimes,
  orderedTime,
  timeInBrief,
  calendarDays,
  POINTS_TO_ACTION,
  addresseeInBrief,
} from './briefFacts.js';
import { carouselLookProblems } from './carouselLook.js';
import { hasStockPhoto, searchStockPhotos, type StockPhoto } from './catalog.js';
import { type DraftFailure, DraftFailedError, headlineLineTooLong } from './draftFailure.js';
import { paintIllustrations, cutOutBilder, type SharepicPainters } from './draftPainting.js';
import { SCENE_PENDING, takeScene, type DraftScene } from './draftScene.js';
import {
  needsSchema,
  type Needs,
  NEEDS_SCHEMA,
  SPEC_SCHEMA,
  SPEC_SCHEMA_DE,
} from './draftSchemas.js';
import { EMBARRASSING_WORDS } from './embarrassingWords.js';
import { alsoCarousel, FORM_RECIPES, formCatalog, formMismatch } from './forms.js';
import { hasOwnPhoto, OWN_PHOTO_RULE, ownPhotoGuard, photoRequestTexts } from './ownPhoto.js';
import {
  paletteHint,
  paletteHinweis,
  paletteSubstitutions,
  withPaletteColors,
} from './paletteColors.js';
import { ownPhotosText } from './photoAnalysis.js';
import { withoutLocale, KEEP_THE_REST, focusHint } from './revisionPrompt.js';
import { textsOf, itemTexts, stringsOf } from './slideTexts.js';
import {
  driftProblems,
  restoreDroppedFields,
  specEditDrift,
  untouchedProblems,
  untouchedSlides,
} from './specEditGuard.js';
import { basicsText, chapterText, examplesText, systemPrompt } from './styleguide.js';

import type { StructuredValidation } from '../ai/structuredParsing.js';

const log = createLogger('sharepicCreator:draft');

const PINNED = { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model };
/** Another model for a draft Gemma could not finish — not just its other host. */
const RESCUE = { provider: 'mistral', model: 'mistral-large-4' } as const;
const RESCUE_ATTEMPTS = 2;

/** No slide with a background kind and typed items: nothing the person asked for went wrong. */
export function lacksStructure(input: unknown): boolean {
  const slides = (input as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides) || !slides.length) return true;
  return slides.some((slide: { background?: { kind?: unknown }; items?: unknown } | null) => {
    if (typeof slide?.background?.kind !== 'string') return true;
    return (
      !Array.isArray(slide.items) ||
      slide.items.some((item: { type?: unknown } | null) => typeof item?.type !== 'string')
    );
  });
}

function fromZod<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  input: unknown
): StructuredValidation<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues.map((i) => issueText(i, input)).join('; ') };
}

/** Live, "at most 24 character(s)" got three longer lines back: the repair names the way out. */
function issueText(issue: z.ZodIssue, input: unknown): string {
  const where = issue.path.join('.') || '(root)';
  const value = issue.path.reduce<unknown>(
    (v, key) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : null),
    input
  );
  if (
    issue.code === 'too_big' &&
    issue.type === 'string' &&
    /\.items\.\d+\.lines\.\d+$/.test(where) &&
    typeof value === 'string'
  ) {
    return headlineLineTooLong(where, value.trim());
  }
  return `${where}: ${issue.message}`;
}

const NO_CONTACT =
  /(https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]{2,}|\b[\w-]+\.(?:de|at|net|com|eu|org)\b)/i;

/**
 * `++marker++` is the DE text-marker box: allowed on quote text, paragraphs and
 * headlines, at most twice per slide. Two DE layouts box every line of their
 * own instead, one box each: the titles of a `spalten` comparison and the
 * points of a `kasten` list. AT never uses it (yellow `==accent==` there; the
 * composer folds a stray `++` into one).
 */
const hasMarker = (text: string) => countMarkerPassages(text) > 0;

/** The strings of a DE layout that each carry their own box, and the rest of the item. */
function ownBoxes(item: SharepicItem): { boxed: string[]; rest: unknown } | null {
  if (item.type === 'vergleich' && item.stil === 'spalten') {
    return {
      boxed: [item.links.titel, item.rechts.titel],
      rest: [item.links.punkte, item.rechts.punkte],
    };
  }
  if (item.type === 'liste' && item.stil === 'kasten') return { boxed: item.items, rest: null };
  if (item.type === 'termine') {
    return {
      boxed: item.eintraege.map((e) => e.titel),
      rest: item.eintraege.map((e) => [e.datum, e.ort]),
    };
  }
  return null;
}

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
    const own = locale === 'de-DE' && !texts ? ownBoxes(item) : null;
    if (texts) passages += texts.reduce((n, t) => n + countMarkerPassages(t), 0);
    else if (own) {
      const part = item.type === 'liste' ? 'Punkt' : 'titel';
      const boxedIn = item.type === 'termine' ? 'im titel eines Eintrags' : 'nur im titel';
      if (own.boxed.some((t) => countMarkerPassages(t) > 1)) {
        problems.push(`${where}Im Element "${item.type}" höchstens eine ++…++-Box je ${part}.`);
      }
      if (stringsOf(own.rest).some(hasMarker)) {
        problems.push(`${where}++…++ steht im ${item.type} ${boxedIn} – sonst weglassen.`);
      }
    } else if (stringsOf(item).some(hasMarker)) {
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
 * A date the person names is the point of the post (Wahltag, Termin). When the
 * draft shows none of them — not in the circle, not in a text — the program
 * puts the first one in the circle. Asked to do it, Gemma handed back the same
 * draft three times in a row.
 */
function withOrderedDate(spec: SharepicSpec, order: string): SharepicSpec {
  // Only unmistakable dates: „14.3." with its closing dot or „14. März" — „1.5 Grad" is none.
  const ordered = [...calendarDays(order.replace(/\d{1,2}\.\s?\d{1,2}(?![\d.])/g, ' '))];
  if (!ordered.length) return spec;
  const shown = new Set(
    spec.slides.flatMap((slide) => [
      ...calendarDays(slide.datum?.date ?? ''),
      ...textsOf(slide).flatMap((text) => [...calendarDays(text)]),
    ])
  );
  if (ordered.some((day) => shown.has(day))) return spec;
  // A carousel ends on the call to action; a single slide carries it itself.
  const at = spec.slides.length - 1;
  const date = `${ordered[0]}.`;
  return {
    ...spec,
    slides: spec.slides.map((slide, i) =>
      i === at ? { ...slide, datum: { ...slide.datum, date } } : slide
    ),
  };
}

/**
 * The same for the time. Under a forced tool call Gemma closes `datum` after
 * its first field: „Donnerstag, 6.11., um 19 Uhr“ came back as `{"weekday":
 * "Do"}` three times in three (21.10.2026). A circle without the time the
 * request names gets it, unless the slide's text already says it.
 */
function withOrderedTime(spec: SharepicSpec, order: string): SharepicSpec {
  const time = orderedTime(order);
  if (!time) return spec;
  return {
    ...spec,
    slides: spec.slides.map((slide) =>
      slide.datum &&
      slide.datum.time === undefined &&
      !textsOf(slide).some((text) => clockTimes(text).length)
        ? { ...slide, datum: { ...slide.datum, time } }
        : slide
    ),
  };
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
  /**
   * The `ki:` scenes this draft may show — painted earlier, or about to be —
   * and the `vorlage:` photos the Vorlage being filled came with.
   */
  sceneRefs: readonly string[] = [],
  /**
   * What the person asked for this turn — without the current draft or the
   * conversation material that `given` also carries. A date named here
   * belongs on the sharepic.
   */
  order: string = given
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
  const slides = base.value.slides;
  errors.push(...bridgeProblems(slides));
  for (const item of slides.flatMap((slide) => slide.items)) {
    if (item.type !== 'aufruf') continue;
    // Where to sign or click is a fact: only what the brief points to.
    if (item.hinweis && !POINTS_TO_ACTION.test(given)) {
      errors.push(
        `Der hinweis "${item.hinweis}" verweist auf etwas, das der Auftrag nicht nennt (Link, Petition, Unterschrift) – hinweis weglassen.`
      );
    }
    if (item.adressat && !addresseeInBrief(item.adressat, givenWords)) {
      errors.push(
        `Der adressat "${item.adressat}" steht nicht im Auftrag – nur, wen der Auftrag nennt, sonst weglassen.`
      );
    }
  }
  // An interview carousel ends by naming where the whole interview is — marked.
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
    const photoKnown = (filename: string) =>
      isSharepicUploadId(filename)
        ? uploadIds.includes(filename)
        : isSharepicSceneRef(filename) || isSharepicVorlageRef(filename)
          ? sceneRefs.includes(filename)
          : hasStockPhoto(filename);
    if (slide.background.kind !== 'farbe') {
      const { filename } = slide.background;
      if (!photoKnown(filename)) {
        errors.push(
          `${where}Foto "${filename}" gibt es nicht — filename aus den Suchergebnissen oder eine id der eigenen Fotos übernehmen, sonst eine Farbe nehmen.`
        );
      }
    }
    for (const item of slide.items) {
      if (item.type !== 'bild') continue;
      if (!photoKnown(item.quelle)) {
        errors.push(
          `${where}Foto "${item.quelle}" gibt es nicht — quelle aus den Suchergebnissen oder eine id der eigenen Fotos übernehmen, sonst das bild weglassen.`
        );
      }
      // On a steckbrief an own photo stands uncut, with its own background.
      if (
        item.ausschnitt === 'freigestellt' &&
        isSharepicUploadId(item.quelle) &&
        !slide.items.some((i) => i.type === 'steckbrief')
      ) {
        errors.push(
          `${where}Ein eigenes Foto stellt der Grünerator nicht frei – für "${item.quelle}" ausschnitt karte, kreis oder einen streifen nehmen.`
        );
      }
      if (item.freisteller && !sceneRefs.includes(item.freisteller)) {
        errors.push(`${where}freisteller setzt der Grünerator selbst – weglassen.`);
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
    // A person's profile is theirs: the name and every trait come from the brief.
    for (const item of slide.items) {
      if (item.type !== 'steckbrief') continue;
      if (!nameInBrief(item.name, givenWords)) {
        errors.push(
          `${where}Der Name "${item.name}" steht nicht im Auftrag – nimm den Namen der Person, die sich vorstellt. Nennt der Auftrag keinen, kein steckbrief.`
        );
      }
      const invented = item.merkmale.filter(
        (m) => !wordsOf(m).some((w) => w.length >= 4 && wordInBrief(w, givenWords))
      );
      if (invented.length) {
        errors.push(
          `${where}Die Merkmale ${invented.map((m) => `"${m}"`).join(', ')} stehen nicht im Auftrag – nur, was der Auftrag über die Person sagt, mit seinen Worten. Nichts über sie erfinden.`
        );
      }
    }
    // A headline is evidence only as printed: medium and every word from the brief or its sources.
    for (const item of slide.items) {
      if (item.type !== 'schlagzeile') continue;
      const missing = [...wordsOf(item.titel), ...wordsOf(item.medium)].filter(
        (w) => !givenWords.has(w)
      );
      if (missing.length) {
        errors.push(
          `${where}Die Schlagzeile "${item.titel}" (${item.medium}) steht nicht so im Auftrag (${missing.slice(0, 3).join(', ')} fehlt) – nur eine Schlagzeile, die Auftrag oder Quellen wörtlich nennen, sonst keine schlagzeile.`
        );
      }
    }
    // Every date of a programme is a fact from the brief, like the date circle's.
    for (const item of slide.items) {
      if (item.type !== 'termine') continue;
      for (const e of item.eintraege) {
        const days = calendarDays(e.datum);
        const inBrief = days.size
          ? [...days].every((day) => calendarDays(given).has(day))
          : given.toLowerCase().includes(e.datum.toLowerCase().replace(/\.$/, ''));
        if (!inBrief) {
          errors.push(
            `${where}Termin "${e.datum}" (${e.titel}) steht nicht im Auftrag – nur Termine, die der Auftrag nennt.`
          );
        }
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
      // A label names data from the brief, so it speaks the brief's words.
      for (const w of item.werte) {
        const missing = wordsOf(w.name).filter((word) => !wordInBrief(word, givenWords));
        if (!missing.length) continue;
        const own = briefWordsFor(w.wert, given);
        errors.push(
          `${where}Beschriftung "${w.name}" nimmt Wörter, die nicht im Auftrag stehen (${missing.join(', ')}) – beschrifte mit den Wörtern des Auftrags${own ? ` („${own}“, gern gekürzt)` : ''}. Nennt der Auftrag keine Bezeichnung, kein diagramm.`
        );
      }
    }
    for (const text of textsOf(slide)) {
      for (const word of wordsOf(text)) {
        if (!EMBARRASSING_WORDS.has(word) || givenWords.has(word)) continue;
        const shown = new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'iu').exec(text)?.[0] ?? word;
        errors.push(
          `${where}"${text}" enthält „${shown}“ – das Wort steht nicht im Auftrag und gehört nicht auf ein Sharepic. Anders formulieren.`
        );
      }
      if (hasUnpairedHandMark(text)) {
        errors.push(
          `${where}"${text}" enthält ein einzelnes (( oder )) – einkreisen immer als ((Wort)), ohne Leerzeichen innen.`
        );
      }
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
  return errors.length
    ? { ok: false, error: errors.join(' ') }
    : { ok: true, value: withOrderedTime(withOrderedDate(base.value, order), order) };
}

const BRIDGE_END = /(?:…|\.\.\.)\s*$/;
const BRIDGE_START = /^\s*(?:…|\.\.\.)/;

/**
 * A sentence running over the slide edge: a slide that picks one up with "…"
 * needs the slide before it to end on "…". A trailing "…" alone is a teaser
 * ("Aber nicht nur das …") and may lead into any slide — just not off the end.
 */
export function bridgeProblems(slides: readonly SharepicSlide[]): string[] {
  const texts = slides.map((slide) => slide.items.flatMap(itemTexts).filter(Boolean));
  const problems: string[] = [];
  texts.forEach((own, i) => {
    if (i === texts.length - 1 && i > 0 && BRIDGE_END.test(own.at(-1) ?? '')) {
      problems.push(`Slide ${i + 1}: die letzte Slide endet auf „…“ – danach kommt nichts mehr.`);
    }
    if (
      BRIDGE_START.test(own[0] ?? '') &&
      !(i > 0 && BRIDGE_END.test(texts[i - 1]!.at(-1) ?? ''))
    ) {
      problems.push(
        `Slide ${i + 1} beginnt mit „…“, aber ${i > 0 ? `Slide ${i} endet nicht auf „…“` : 'davor kommt keine Slide'} – den Satz dort mit „…“ enden lassen oder hier ohne „…“ beginnen.`
      );
    }
  });
  return problems;
}

function describePhotos(photos: StockPhoto[]): string {
  return photos.map((p) => `- ${p.filename}: ${p.alt_text}`).join('\n');
}

export { DraftFailedError };
export { textsOf } from './slideTexts.js';
export { SCENE_PENDING, takeScene, type DraftScene } from './draftScene.js';
export { type SharepicPainters } from './draftPainting.js';
export { isQuoteBrief, namesSpeaker, spelledNumbers } from './briefFacts.js';

const DRAFT_ATTEMPTS = 3;

/**
 * `defaultLocale` is the user's profile country; the model may switch it when
 * the request clearly belongs to the other country. A revision keeps the
 * draft's country. `order` is the person's own request when `prompt` carries
 * more (the chat's conversation material).
 */
export async function draftSharepic(
  prompt: string,
  defaultLocale: SharepicCreatorLocale,
  current: SharepicSpec | null = null,
  ownPhotos: readonly SharepicOwnPhoto[] = [],
  /** Without them (no user) a scene becomes a colour and an illustration an icon. */
  painters: SharepicPainters = {},
  /** The form the request named or the user picked; the creator chooses when null. */
  named: SharepicFormId | null = null,
  /** What the person asked for this turn — the request's own dates belong on the sharepic. */
  order: string = prompt,
  /** With `current`: the slide (and elements) the change request is about. */
  focus: SharepicDraftFocus | null = null,
  /** The planner's brief, when it spells out a change `order` only confirms ("ja, mach das"). */
  brief: string | null = null,
  /** The request asks for a single image: a first draft gets exactly one slide. */
  oneSlide = false
): Promise<SharepicDraftResponse> {
  const fixed = current?.locale ?? null;
  const single = oneSlide && !current;
  const countryHint = fixed
    ? `Land: ${fixed} (steht fest).`
    : `Land: Standard ist ${defaultLocale} (Profil der Person). Nimm das andere Land nur, wenn der Auftrag eindeutig dorthin gehört — Orte, Landesorganisationen, typische Begriffe („Gemeinderat in Graz“ → de-AT, „Kreistag in Bayern“ → de-DE).`;
  // A revision keeps the draft and changes only what was asked for.
  const task = current
    ? `Aktueller Entwurf:\n${JSON.stringify(withoutLocale(current))}\n\nÄnderungswunsch:\n${prompt}${focusHint(current, focus)}\n\n${KEEP_THE_REST}${hasOwnPhoto(current) ? `\n${OWN_PHOTO_RULE}` : ''}`
    : `Auftrag:\n${prompt}`;
  const build = current
    ? 'Ändere den Entwurf wie gewünscht und gib ihn vollständig mit entwurf_abgeben ab. Lass alles andere unverändert.'
    : `Baue jetzt das Sharepic – ${single ? 'genau eine Slide' : 'eine Slide oder ein Karussell'} – und gib es mit entwurf_abgeben ab.`;

  const needs = await aiObject<Needs>({
    lane: 'sharepic_creator',
    pinned: PINNED,
    system: systemPrompt(fixed ?? defaultLocale),
    prompt: `${task}${ownPhotos.length ? `\n\n${ownPhotosText(ownPhotos)}` : ''}\n\n${countryHint}\n\n## Formen\n${formCatalog()}\n\n${named ? `Die Form steht fest: \`${named}\`. Nenne als alternativen zwei andere, die auch passen würden.` : `Wähle die Form, die den Inhalt am besten trägt, und zwei andere als alternativen.${single ? ' Der Auftrag will ein einzelnes Bild: wähle eine Form mit genau einer Slide, kein Karussell und kein Interview.' : ''}`}\n\nBevor du baust: Welche Form, für welches Land, welche Beispiele und Kapitel brauchst du, und wonach soll gesucht werden?`,
    toolName: 'bedarf_melden',
    toolDescription:
      'Melde Form, Alternativen, Land, passende Beispiele, Kapitel und die Suchbegriffe für ein Foto.',
    schema: NEEDS_SCHEMA,
    validate: (input) => fromZod(needsSchema, input),
    maxOutputTokens: 800,
    label: 'sharepicCreator:needs',
  });
  if (!needs.ok) {
    throw new DraftFailedError(needs.error, { kind: needs.cause ? 'provider' : 'structure' });
  }
  log.info(`needs ${JSON.stringify(needs.data)}`);
  const locale = fixed ?? needs.data.land;
  const picked = named ?? needs.data.form;
  const chosen =
    single && (picked === 'karussell' || picked === 'interview') ? 'einzelbild' : picked;
  const alternativen = [...new Set(needs.data.alternativen)].filter((f) => f !== chosen);
  // A revision keeps its form unless the request names one.
  const form = current ? named : chosen;
  const recipe = form ? FORM_RECIPES[form] : null;

  // A revision's chapters and examples pushed rebuilds (headline → list, #4252):
  // it keeps its form, so only a form the request names brings its own.
  const wanted = current ? { kapitel: [], anlass: [] } : needs.data;
  const chapters = [...new Set([...(recipe?.kapitel ?? []), ...wanted.kapitel])];
  const photos = [
    ...new Map(
      needs.data.fotos_suchen.flatMap((q) => searchStockPhotos(q)).map((p) => [p.filename, p])
    ).values(),
  ];

  const context = [
    basicsText(locale),
    ownPhotos.length ? ownPhotosText(ownPhotos) : '',
    ...chapters.map(chapterText),
    examplesText(locale, [...new Set([...(recipe?.anlass ?? []), ...wanted.anlass])].slice(0, 3)),
    needs.data.fotos_suchen.length
      ? photos.length
        ? `## Gefundene Fotos (filename: Motiv)\n${describePhotos(photos)}`
        : '## Gefundene Fotos\nKein Foto passt zum Thema. Nimm eine Markenfarbe als Hintergrund (kein Foto).'
      : '',
  ].filter(Boolean);

  // Images painted for this draft before, and a Vorlage's own photos, stay usable in a revision.
  const keptImage = (ref: string) => isSharepicSceneRef(ref) || isSharepicVorlageRef(ref);
  const keptScenes = (current?.slides ?? []).flatMap((slide) => [
    ...(slide.background.kind !== 'farbe' && keptImage(slide.background.filename)
      ? [slide.background.filename]
      : []),
    ...slide.items.flatMap((item) =>
      item.type === 'infografik'
        ? item.punkte.flatMap((p) => (p.bild ? [p.bild] : []))
        : item.type === 'bild'
          ? [item.quelle, item.freisteller ?? ''].filter(keptImage)
          : []
    ),
  ]);
  // A Vorlage ships its cut-out; the cut-out painter cannot load a `vorlage:` photo.
  const shippedCutOuts = new Map(
    (current?.slides ?? []).flatMap((slide) =>
      slide.items.flatMap((item) =>
        item.type === 'bild' && item.freisteller && isSharepicVorlageRef(item.freisteller)
          ? [[item.quelle, item.freisteller] as const]
          : []
      )
    )
  );
  // Own photos already on the draft stay usable in a revision, even without the photo list.
  const keptUploads = (current?.slides ?? []).flatMap((slide) =>
    [
      slide.background.kind !== 'farbe' ? slide.background.filename : '',
      ...slide.items.map((item) => (item.type === 'bild' ? item.quelle : '')),
    ].filter(isSharepicUploadId)
  );
  // Without a painter a Faktenbild cannot get its scene; it falls back to a colour.
  const checkForm = form === 'faktenbild' && !painters.scene ? null : form;
  // "Karussell mit Bingo": both hold — three slides and the bingo.
  const carouselToo = !current && alsoCarousel(order, form);
  const palette = paletteSubstitutions(order, locale);
  const colourHint = palette.length ? `\n\n${paletteHint(palette)}` : '';
  // What the guard lets change: the request and its brief, never the conversation material.
  const asked = brief ? `${order}\n${brief}` : order;
  // An own photo goes only when the request names it (#4253) — never read from `prompt`,
  // whose researched sources may say „Bild“ anywhere.
  const photoGuard = ownPhotoGuard<{
    spec: SharepicSpec;
    scene: DraftScene | null;
    kept: string | null;
  }>(current, photoRequestTexts(order, brief));
  // What the last checkable attempt got wrong, for the person's text if every attempt fails.
  // „Not your request" only while no attempt has delivered a draft to check.
  let failure: DraftFailure = { kind: 'structure' };

  const draftCall: AiObjectCall<{
    spec: SharepicSpec;
    scene: DraftScene | null;
    kept: string | null;
  }> = {
    lane: 'sharepic_creator',
    pinned: PINNED,
    system: `${systemPrompt(locale)}\n\n${context.join('\n\n')}`,
    prompt: `${task}${colourHint}\n\n${form ? `Form: ${sharepicFormLabel(form)}${carouselToo ? ' im Karussell (3–8 Slides)' : ''} – ${FORM_RECIPES[form].wann}.\n\n` : ''}${build}`,
    toolName: 'entwurf_abgeben',
    toolDescription: 'Gib den fertigen Sharepic-Entwurf ab.',
    schema: locale === 'de-DE' ? SPEC_SCHEMA_DE : SPEC_SCHEMA,
    validate: (input, attempt, attempts) => {
      if (!lacksStructure(input)) failure = { kind: 'content' };
      const taken = takeScene(withPaletteColors(input, locale));
      if (!taken.ok) return taken;
      // Contact data already on the draft counts as given.
      const checked = validateDraft(
        taken.input,
        locale,
        current ? `${prompt}\n${JSON.stringify(current)}` : prompt,
        [...ownPhotos.map((p) => p.id), ...keptUploads],
        taken.scene ? [SCENE_PENDING, ...keptScenes] : keptScenes,
        order
      );
      if (!checked.ok) return checked;
      const notSingle =
        single &&
        checked.value.slides.length !== 1 &&
        `${sharepicFormLabel(form!)}: genau eine Slide – der Auftrag will ein einzelnes Bild.`;
      const formWrong = checkForm && formMismatch(checkForm, checked.value, taken.scene !== null);
      const carouselWrong =
        carouselToo && formMismatch('karussell', checked.value, taken.scene !== null);
      const mismatch = notSingle || formWrong || carouselWrong;
      if (mismatch) {
        failure = { kind: 'form', form: notSingle || formWrong ? form! : 'karussell' };
        return { ok: false, error: `Der Auftrag ist ein Sharepic der Form ${mismatch}` };
      }
      // A new carousel holds one look; the last attempt passes rather than fail the draft.
      const look = !current && attempt < attempts ? carouselLookProblems(checked.value) : null;
      if (look) return { ok: false, error: look };
      // Like a drift: the last attempt passes, the reply then says the slide stayed.
      const untouched =
        current && attempt < attempts ? untouchedSlides(current, checked.value, asked) : [];
      if (untouched.length) return { ok: false, error: untouchedProblems(untouched) };
      const drifts = current ? specEditDrift(current, checked.value, asked, focus) : [];
      let value: { spec: SharepicSpec; scene: DraftScene | null; kept: string | null } = {
        spec: checked.value,
        scene: taken.scene,
        kept: null,
      };
      if (drifts.length) {
        // The model's last attempt restores, also after attempts that never got here.
        if (attempt < attempts) return { ok: false, error: driftProblems(drifts, current!) };
        // Out of repair turns: keep what was asked, put back what was dropped.
        const restored = restoreDroppedFields(checked.value, drifts);
        value = { spec: restored.spec, scene: taken.scene, kept: restored.hinweis };
      }
      // The own photo last: it may undo a drift restore's background choice, never the reverse.
      return photoGuard.check(value);
    },
    attempts: DRAFT_ATTEMPTS,
    // A carousel of up to eight slides.
    maxOutputTokens: 5000,
    label: 'sharepicCreator:draft',
  };
  let draft = await aiObject(draftCall);
  // Repairs on the same model repeat its mistake — three identical `{}` at
  // temperature 0 (21.10.2026). A draft it could not finish gets one round on
  // another model before the person reads a failure. Not after an outage: the
  // lane's fallback chain has already tried that model.
  if (!draft.ok && !draft.cause && !photoGuard.fallback(draft.error)) {
    log.warn(`draft failed on ${PINNED.model}, retrying on ${RESCUE.model}: ${draft.error}`);
    draft = await aiObject({ ...draftCall, pinned: RESCUE, attempts: RESCUE_ATTEMPTS });
  }
  // Every attempt dropped the own photo: keep it and say so rather than fail.
  const photoKept = draft.ok ? null : photoGuard.fallback(draft.error);
  if (!draft.ok && !photoKept) {
    throw new DraftFailedError(draft.error, draft.cause ? { kind: 'provider' } : failure);
  }
  const accepted = draft.ok ? draft.data : photoKept!;

  // A revision keeps the draft's format unless the model names one.
  const drafted = accepted.spec;
  let spec = current?.format && !drafted.format ? { ...drafted, format: current.format } : drafted;
  let hinweis: string | null = null;
  const scene = accepted.scene;
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
  const cut = await cutOutBilder(illustrated.spec, painters.cutOut, shippedCutOuts);
  spec = cut.spec;
  hinweis =
    [
      paletteHinweis(palette),
      hinweis ?? illustrated.hinweis,
      cut.hinweis,
      accepted.kept,
      photoKept?.hinweis ?? (draft.ok ? photoGuard.note() : null),
    ]
      .filter(Boolean)
      .join(' ') || null;
  return {
    spec,
    ...(hinweis && { hinweis }),
    ...(form && { form }),
    ...(alternativen.length && { alternativen: alternativen.slice(0, 2) }),
    chapters,
    attributions: spec.slides.map((slide) => {
      const photo = slidePhotoFilename(slide);
      const credit =
        photo &&
        !isSharepicUploadId(photo) &&
        !isSharepicSceneRef(photo) &&
        !isSharepicVorlageRef(photo)
          ? getAttribution(photo)
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
