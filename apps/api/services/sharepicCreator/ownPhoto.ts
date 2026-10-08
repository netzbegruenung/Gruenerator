import { isSharepicUploadId, type SharepicSpec } from '@gruenerator/contracts';

import { type StructuredValidation } from '../ai/structuredParsing.js';

type Slide = SharepicSpec['slides'][number];

/** The one line the prompt adds when the draft carries the person's own photo. */
export const OWN_PHOTO_RULE =
  'Eigene Fotos der Person (upload:N) bleiben als Hintergrund, außer der Wunsch verlangt ausdrücklich ein anderes Foto oder keins.';

export const OWN_PHOTO_KEPT_HINWEIS =
  'Dein eigenes Foto bleibt – die Änderung ließ sich ohne das Foto nicht umsetzen.';

const PHOTO_WORD =
  /(?<!\p{L})(?:foto|fotos|fotohintergrund|bild|bilder|bildes|bilds|hintergrundbild|aufnahme)(?!\p{L})/giu;
/** „Foto behalten“, „das Bild bleibt“, „ohne das Foto zu ändern“: the photo is named to keep it. */
const KEEP_WORD = /(?<!\p{L})(?:behalt\p{L}*|bleib\p{L}*|unver[äa]ndert|zu [äa]ndern)(?!\p{L})/iu;
/** A keep word counts only in the photo word's own clause: „Foto weg, Rest bleibt“ names it. */
const CLAUSE = /[,.;:!?\n]|(?<!\p{L})(?:aber|sondern|und|nur)(?!\p{L})/iu;

/** The request is about the photo itself: replacing or removing it is then wanted. */
export function namesPhoto(instruction: string): boolean {
  for (const m of instruction.matchAll(PHOTO_WORD)) {
    const before = instruction.slice(0, m.index).split(CLAUSE).at(-1) ?? '';
    const after = instruction.slice(m.index + m[0].length).split(CLAUSE)[0] ?? '';
    if (!KEEP_WORD.test(`${before} ${m[0]} ${after}`)) return true;
  }
  return false;
}

/** „ja, mach das“: the order means what the chat asked before. */
const CONFIRMATION =
  /^\s*(?:ja|jo|jep|ok|okay|gerne?|passt|genau|klar|einverstanden|super|perfekt|mach das)(?!\p{L})/iu;

/**
 * The texts that may name the photo. `instruction` is the chat model's
 * paraphrase: read only when the order is a bare confirmation, or a pure
 * colour request whose paraphrase says „Foto“ would drop the photo.
 */
export function photoRequestTexts(order: string, instruction: string | null): string[] {
  // `search` ignores the global flag's lastIndex. An order that speaks of the photo decides alone.
  if (!instruction || order.search(PHOTO_WORD) >= 0) return [order];
  return CONFIRMATION.test(order) ? [order, instruction] : [order];
}

const uploadOf = (slide: Slide): string | null =>
  slide.background.kind !== 'farbe' && isSharepicUploadId(slide.background.filename)
    ? slide.background.filename
    : null;

export const hasOwnPhoto = (spec: SharepicSpec): boolean => spec.slides.some((s) => !!uploadOf(s));

/** Key order does not matter: the model may echo an item with its fields reordered. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? '';
}
const sameTexts = (a: Slide, b: Slide): boolean => stable(a.items) === stable(b.items);

/** A request that takes slides out: „Lösch die erste Folie“, „Folie 3 weg“, „nur noch zwei Slides“, „Entferne die Titelseite“. */
const REMOVES_SLIDE =
  /(?<!\p{L})(?:l(?:ö|oe)sch\p{L}*|entfern\p{L}*|streich\p{L}*|weg|raus|nur noch|k(?:ü|ue)rzer)(?!\p{L})[^.!?\n]*(?:folie|seite|slide)\p{L}*|(?:folie|seite|slide)\p{L}*[^.!?\n]*(?<!\p{L})(?:l(?:ö|oe)sch\p{L}*|entfern\p{L}*|streich\p{L}*|weg|raus)(?!\p{L})/iu;

export type OwnPhotoCheck =
  | { ok: true }
  /** `slides`: 0-based draft indices that got their photo back; `restored`: the draft with it. */
  | { ok: false; error: string; slides: number[]; restored: SharepicSpec };

/**
 * Whether a revision kept every own photo (`upload:N`) of `current`. A photo
 * still used as a background anywhere counts as kept (slides may be reordered,
 * the layout may change). A gone photo counts as lost only when its slide is
 * still there — the slide with the same texts, or else the one at the same
 * place; when the request removes slides, the photo's slide may be the one
 * that went and takes its photo along.
 * A slide that holds another own photo is never overwritten; the web side
 * then reports the lost one.
 */
export function ownPhotoKept(
  current: SharepicSpec,
  draft: SharepicSpec,
  instruction: string
): OwnPhotoCheck {
  if (namesPhoto(instruction)) return { ok: true };
  const removesSlides =
    draft.slides.length < current.slides.length && REMOVES_SLIDE.test(instruction);
  const used = new Set(draft.slides.map(uploadOf));
  const restore = new Map<number, Slide>();
  current.slides.forEach((slide, i) => {
    const upload = uploadOf(slide);
    if (!upload || used.has(upload)) return;
    // Never onto a slide that carries an own photo itself: that one would be lost instead.
    const free = (j: number) => !restore.has(j) && !uploadOf(draft.slides[j]!);
    const same = draft.slides.findIndex((d, j) => free(j) && sameTexts(slide, d));
    // By place, unless the request removes slides: then the photo's slide may be the one that went.
    const place = removesSlides ? -1 : Math.min(i, draft.slides.length - 1);
    const at = same >= 0 ? same : place >= 0 && free(place) ? place : -1;
    if (at < 0) return;
    const now = draft.slides[at]!;
    // Untouched texts: the whole slide as it was; otherwise the edit stays, on the photo's layout.
    restore.set(
      at,
      sameTexts(slide, now)
        ? slide
        : { ...now, background: slide.background, position: slide.position }
    );
  });
  if (!restore.size) return { ok: true };
  const slides = [...restore.keys()].sort((a, b) => a - b);
  const named = slides.map((j) => `Folie ${j + 1} (${uploadOf(restore.get(j)!)})`).join(', ');
  return {
    ok: false,
    slides,
    error: `${named}: das ist das eigene Foto der Person – es bleibt. Für eine andere Farbe nimm \`foto-oben\` oder \`foto-unten\` mit demselben filename und \`panelColor\`, oder lass das Foto, wie es ist.`,
    restored: { ...draft, slides: draft.slides.map((slide, j) => restore.get(j) ?? slide) },
  };
}

/**
 * Wraps the check for the draft call's `validate`: rejects a lost own photo
 * (the repair turn follows), and after the last attempt `fallback` hands back
 * the draft with the photo restored and a note — but only if that rejection
 * was the final error. `instructions`: the request and what it carries (a bare
 * „ja, mach das“ names the photo only through the conversation notes).
 */
export function ownPhotoGuard<T extends { spec: SharepicSpec; scene: { slide: number } | null }>(
  current: SharepicSpec | null,
  instructions: readonly string[]
) {
  const named = instructions.some(namesPhoto);
  let last: { error: string; value: T } | null = null;
  return {
    check(value: T): StructuredValidation<T> {
      if (!current || named) return { ok: true, value };
      // `named` is false here, so the joined request only decides about removed slides.
      const kept = ownPhotoKept(current, value.spec, instructions.join('\n'));
      if (kept.ok) return { ok: true, value };
      const scene = value.scene && kept.slides.includes(value.scene.slide) ? null : value.scene;
      last = { error: kept.error, value: { ...value, spec: kept.restored, scene } };
      return { ok: false, error: kept.error };
    },
    fallback(error: string): (T & { hinweis: string }) | null {
      return last && last.error === error
        ? { ...last.value, hinweis: OWN_PHOTO_KEPT_HINWEIS }
        : null;
    },
  };
}
