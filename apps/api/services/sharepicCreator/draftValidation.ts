import {
  isSharepicSceneRef,
  isSharepicUploadId,
  isSharepicVorlageRef,
  type SharepicCreatorLocale,
  type SharepicItem,
  type SharepicSlide,
  type SharepicSpec,
  sharepicSpecSchema,
  countMarkerPassages,
  hasUnpairedAccentMark,
  hasUnpairedHandMark,
  SHAREPIC_MARKER_PASSAGES,
  tightenAccentMarksDeep,
} from '@gruenerator/contracts';
import { type z } from 'zod';

import {
  isQuoteBrief,
  namesSpeaker,
  sourceInBrief,
  wordsOf,
  foundedInBrief,
  nameInBrief,
  wordInBrief,
  briefWordsFor,
  NUMBER,
  digits,
  spelledNumbers,
  clockTimes,
  orderedTime,
  timeInBrief,
  calendarDays,
  POINTS_TO_ACTION,
  addresseeInBrief,
} from './briefFacts.js';
import { hasStockPhoto } from './catalog.js';
import { headlineLineTooLong } from './draftFailure.js';
import { EMBARRASSING_WORDS } from './embarrassingWords.js';
import { itemTexts, stringsOf, textsOf } from './slideTexts.js';

import type { StructuredValidation } from '../ai/structuredParsing.js';

export function fromZod<T>(schema: z.ZodType<T, unknown>, input: unknown): StructuredValidation<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues.map((i) => issueText(i, input)).join('; ') };
}

/** Live, "at most 24 character(s)" got three longer lines back: the repair names the way out. */
function issueText(issue: z.ZodIssue, input: unknown): string {
  const where = issue.path.join('.') || '(root)';
  const value = issue.path.reduce<unknown>(
    (v, key) => (v && typeof v === 'object' ? (v as Record<PropertyKey, unknown>)[key] : null),
    input
  );
  if (
    issue.code === 'too_big' &&
    issue.origin === 'string' &&
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
  order: string = given,
  /** Stock photos beyond our catalogue: found live this turn, or kept from the current draft. */
  livePhotos: readonly string[] = []
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
          : hasStockPhoto(filename) || livePhotos.includes(filename);
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
