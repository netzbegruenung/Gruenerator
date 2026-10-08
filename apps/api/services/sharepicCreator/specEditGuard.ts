/**
 * A revision changes what was asked and nothing else. Live (#4252) the draft
 * dropped a quote's "Landtagsabgeordnete" on every headline edit and turned a
 * headline slide into a list — and the vision review passed both, because it
 * never sees the spec that went in. So the draft is compared against it here.
 */
import {
  accentLines,
  namedSharepicSlides,
  sameSharepicContent,
  SHAREPIC_ITEM_LABELS,
  type SharepicDraftFocus,
  type SharepicItem,
  type SharepicSlide,
  type SharepicSpec,
} from '@gruenerator/contracts';

export type SpecEditDrift =
  | { kind: 'slides'; from: number; to: number }
  | { kind: 'items'; slide: number; from: number; to: number }
  | { kind: 'type'; slide: number; item: number; from: SharepicItem; to: SharepicItem }
  | { kind: 'field'; slide: number; item: number | null; field: string; value: unknown };

/** The words a request uses for a field; without an entry the field's own name. */
const FIELD_WORDS: Record<string, { label: string; words: RegExp }> = {
  funktion: { label: 'Funktion', words: /funktion|amt\b|rolle|beruf|abgeordnet|position/ },
  quelle: { label: 'Quelle', words: /quelle/ },
  akzent: { label: 'Hervorhebung', words: /hervorheb|akzent|highlight|markier|betont/ },
  groesse: {
    label: 'Schriftgröße',
    words: /größe|(?<!\p{L})groß(?:e[mnrs]?|er(?:e[mnrs]?)?)?(?!\p{L})|klein|schrift/u,
  },
  stoerer: { label: 'Störer', words: /störer|stoerer|sticker|badge/ },
  datum: { label: 'Datum', words: /datum|termin|uhrzeit|wochentag/ },
  ort: { label: 'Ort', words: /\bort\b|adresse/ },
  von: { label: 'Medium', words: /medium|zeitung/ },
  stil: { label: 'Stil', words: /stil|aufzählung|punkte|ziffern|haken|pfeile/ },
  betont: { label: 'Betonung', words: /beton|hervorheb/ },
};
const SLIDE_FIELDS = ['quelle', 'stoerer', 'datum', 'ort'] as const;

/** Word starts only: „Vorteile“ and „Zusammenhalt“ ask for nothing. */
const ADD_OR_REMOVE =
  /(?<!\p{L})(?:hinzu|ergänz|zusätzlich|neue[nrs]?(?!\p{L})|entfern|lösch|streich|weg(?!\p{L})|weglass|(?:he)?raus(?!ch)|ohne(?!\p{L})|kein(?:e[mnrs]?)?(?!\p{L})|nicht mehr|nur noch|weniger|aufteil|teil(?:e|en)?(?!\p{L})|zusammenleg|zusammenfass)/u;
const SLIDE_WORDS = /folie|slide|karussell/;

function fieldLabel(field: string): string {
  return FIELD_WORDS[field]?.label ?? field;
}

function names(order: string, field: string): boolean {
  return (FIELD_WORDS[field]?.words ?? new RegExp(field)).test(order);
}

const atWordStart = (order: string, word: string) =>
  new RegExp(`(?<!\\p{L})${word}`, 'u').test(order);

function namesType(order: string, item: SharepicItem): boolean {
  return (
    atWordStart(order, item.type) ||
    atWordStart(order, SHAREPIC_ITEM_LABELS[item.type].toLowerCase())
  );
}

const present = (value: unknown) => value !== undefined && value !== null && value !== '';

/** An accent on a line the shorter headline no longer has went with that line. */
function accentStillFits(from: SharepicItem, to: SharepicItem): boolean {
  if (from.type !== 'headline' || to.type !== 'headline' || from.akzent === undefined) return true;
  return accentLines(from.akzent).every((line) => line < to.lines.length);
}

function droppedItemFields(from: SharepicItem, to: SharepicItem): string[] {
  const next = to as Record<string, unknown>;
  return Object.entries(from)
    .filter(([key, value]) => key !== 'type' && present(value) && !present(next[key]))
    .map(([key]) => key)
    .filter((key) => key !== 'akzent' || accentStillFits(from, to));
}

function compareSlide(
  from: SharepicSlide,
  to: SharepicSlide,
  slide: number,
  order: string
): SpecEditDrift[] {
  const drifts: SpecEditDrift[] = [];
  for (const field of SLIDE_FIELDS) {
    if (present(from[field]) && !present(to[field]) && !names(order, field)) {
      drifts.push({ kind: 'field', slide, item: null, field, value: from[field] });
    }
  }
  if (from.items.length !== to.items.length) {
    if (!ADD_OR_REMOVE.test(order)) {
      drifts.push({ kind: 'items', slide, from: from.items.length, to: to.items.length });
    }
    return drifts;
  }
  from.items.forEach((old, item) => {
    const now = to.items[item]!;
    if (old.type !== now.type) {
      if (!namesType(order, now)) drifts.push({ kind: 'type', slide, item, from: old, to: now });
      return;
    }
    for (const field of droppedItemFields(old, now)) {
      if (names(order, field)) continue;
      drifts.push({
        kind: 'field',
        slide,
        item,
        field,
        value: (old as Record<string, unknown>)[field],
      });
    }
  });
  return drifts;
}

/**
 * What the draft changed that the request does not name. With a focus on a
 * carousel only that slide is compared — the rest is the model's to keep.
 */
export function specEditDrift(
  current: SharepicSpec,
  next: SharepicSpec,
  order: string,
  focus: SharepicDraftFocus | null = null
): SpecEditDrift[] {
  const asked = order.toLowerCase();
  const drifts: SpecEditDrift[] = [];
  const from = current.slides.length;
  const to = next.slides.length;
  if (from !== to && !(SLIDE_WORDS.test(asked) && ADD_OR_REMOVE.test(asked))) {
    drifts.push({ kind: 'slides', from, to });
  }
  const scope =
    focus && from > 1 ? [focus.slide] : Array.from({ length: Math.min(from, to) }, (_, i) => i);
  for (const s of scope) {
    const old = current.slides[s];
    const now = next.slides[s];
    if (old && now) drifts.push(...compareSlide(old, now, s, asked));
  }
  return drifts;
}

/** Items whose words only the request gives: a slide of nothing else cannot be reworded. */
const GIVEN_ONLY = new Set<SharepicItem['type']>([
  'zitat',
  'zahl',
  'diagramm',
  'rechnung',
  'termine',
  'schlagzeile',
  'faktencheck',
  'bingo',
]);

/**
 * The carousel slides the request names („1. Slide“, „Folie 2“) that came back
 * exactly as they were. Live, „bei der 1. slide einen anderen text wählen“
 * was answered „Erledigt“ while slide 1 had not moved.
 */
export function untouchedSlides(
  current: SharepicSpec,
  next: SharepicSpec,
  order: string
): number[] {
  if (current.slides.length < 2) return [];
  return namedSharepicSlides(order, current.slides).filter((s) => {
    const old = current.slides[s]!;
    const now = next.slides[s];
    return (
      now !== undefined &&
      sameSharepicContent(old, now) &&
      !old.items.every((item) => GIVEN_ONLY.has(item.type))
    );
  });
}

/** The repair turn for slides the request names but the draft left alone. */
export function untouchedProblems(slides: readonly number[]): string {
  return slides
    .map(
      (s) =>
        `Folie ${s + 1} ist unverändert, der Wunsch betrifft aber genau diese Folie (gezählt ab 1, im Entwurf slides[${s}]). Setze dort um, was verlangt ist – „anderer Text“ heißt: neue Texte schreiben. Die übrigen Folien bleiben.`
    )
    .join(' ');
}

const where = (slide: number, deck: SharepicSpec) =>
  deck.slides.length > 1 ? `Folie ${slide + 1}: ` : '';

function shown(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** The repair turn: names each field that has to stay, in the draft's own terms. */
export function driftProblems(drifts: readonly SpecEditDrift[], current: SharepicSpec): string {
  return drifts
    .map((d) => {
      switch (d.kind) {
        case 'slides':
          return `Der Entwurf hat ${d.to} statt ${d.from} Folien – die Folienzahl bleibt, der Wunsch nennt keine neue oder wegfallende Folie.`;
        case 'items':
          return `${where(d.slide, current)}${d.to} statt ${d.from} Elemente – Elemente nicht aufteilen, zusammenlegen oder weglassen; ändere die vorhandenen.`;
        case 'type':
          return `${where(d.slide, current)}Element ${d.item + 1} ist ein ${d.from.type} und bleibt ein ${d.from.type} (nicht ${d.to.type}) – ändere seinen Inhalt, nicht seine Art.`;
        case 'field':
          return d.item === null
            ? `${where(d.slide, current)}${d.field} „${shown(d.value)}“ fehlt – das Feld bleibt unverändert, der Wunsch nennt es nicht.`
            : `${where(d.slide, current)}Im ${current.slides[d.slide]!.items[d.item]!.type} (Element ${d.item + 1}) fehlt ${d.field} „${shown(d.value)}“ – das Feld bleibt unverändert, der Wunsch nennt es nicht.`;
      }
    })
    .join(' ');
}

/**
 * After the last repair turn: put the dropped optional fields back instead of
 * failing the edit. A structural change stays, but is reported.
 */
export function restoreDroppedFields(
  next: SharepicSpec,
  drifts: readonly SpecEditDrift[]
): { spec: SharepicSpec; hinweis: string | null } {
  const fields = drifts.filter((d) => d.kind === 'field');
  const slides = next.slides.map((slide, s) => {
    const own = fields.filter((d) => d.slide === s);
    if (!own.length) return slide;
    const back = Object.fromEntries(
      own.filter((d) => d.item === null).map((d) => [d.field, d.value])
    );
    return {
      ...slide,
      ...back,
      items: slide.items.map((item, i) => {
        const mine = own.filter((d) => d.item === i);
        return mine.length
          ? ({
              ...item,
              ...Object.fromEntries(mine.map((d) => [d.field, d.value])),
            } as SharepicItem)
          : item;
      }),
    };
  });
  const notes: string[] = [];
  if (fields.length) {
    const kept = fields.map((d) => `${fieldLabel(d.field)} „${shown(d.value)}“`);
    notes.push(`${kept.join(', ')} habe ich beibehalten.`);
  }
  for (const d of drifts) {
    if (d.kind === 'type') {
      notes.push(
        `${where(d.slide, next)}Aus ${SHAREPIC_ITEM_LABELS[d.from.type]} wurde ${SHAREPIC_ITEM_LABELS[d.to.type]}.`
      );
    } else if (d.kind === 'items') {
      notes.push(
        `${where(d.slide, next)}Der Aufbau hat sich geändert (${d.to} statt ${d.from} Elemente).`
      );
    } else if (d.kind === 'slides') {
      notes.push(`Das Karussell hat jetzt ${d.to} statt ${d.from} Folien.`);
    }
  }
  return { spec: { ...next, slides }, hinweis: notes.length ? notes.join(' ') : null };
}
