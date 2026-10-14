import {
  namedSharepicSlides,
  sameSharepicContent,
  SHAREPIC_COLOR_LABELS,
  SHAREPIC_ITEM_LABELS,
  SHAREPIC_REQUEST_BOUND_ITEMS,
  type SharepicItem,
  type SharepicPhotoAttribution,
  type SharepicSlide,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { sharepicSourceNote } from './sharepicSourceNote.js';

const NOT_TEXT = new Set(['type', 'stil', 'art', 'form', 'seite', 'icon', 'op', 'bild', 'motiv']);

/** The words an item shows, without marks — enough to recognise it. */
function itemWords(item: SharepicItem): string {
  const words: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (NOT_TEXT.has(key)) return;
    if (typeof value === 'string') words.push(value);
    else if (Array.isArray(value)) value.forEach((v) => walk(v, ''));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(item, '');
  return words
    .join(' ')
    .replace(/==|\+\+|\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const quoted = (text: string) => `„${text.length > 70 ? `${text.slice(0, 69)}…` : text}“`;

const POSITION: Record<SharepicSlide['position'], string> = {
  oben: 'oben',
  mitte: 'in der Mitte',
  unten: 'unten',
};
const ALIGN: Record<SharepicSlide['align'], string> = {
  links: 'linksbündig',
  zentriert: 'zentriert',
};
const FIELD_LABELS: Record<string, string> = {
  stoerer: 'Störer',
  datum: 'Datum',
  ort: 'Ort',
  quelle: 'Quelle',
  weiter: 'Weiter-Teaser',
  nummer: 'Nummerierung',
  zeilenboxen: 'Zeilenboxen',
  logo: 'Logo',
  format: 'Format',
  seitenzahl: 'Seitenzahl',
  pfeil: 'Weiter-Pfeil',
};
const SLIDE_OWN = new Set(['items', 'background', 'position', 'align']);

function fieldChanges(from: object, to: object, skip: Set<string>): string[] {
  const a = from as Record<string, unknown>;
  const b = to as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((key) => !skip.has(key) && !sameSharepicContent(a[key], b[key]))
    .map((key) => {
      const label = FIELD_LABELS[key] ?? key;
      if (a[key] === undefined || a[key] === false) return `${label} neu`;
      if (b[key] === undefined || b[key] === false) return `${label} entfernt`;
      return `${label} geändert`;
    });
}

function backgroundChange(from: SharepicSlide['background'], to: SharepicSlide['background']) {
  if (to.kind === 'farbe') return `Hintergrund jetzt ${SHAREPIC_COLOR_LABELS[to.color]}`;
  if (from.kind === 'farbe' || from.filename !== to.filename) return 'neues Foto';
  if (from.kind === to.kind && 'panelColor' in from && 'panelColor' in to) {
    return `Fläche jetzt ${SHAREPIC_COLOR_LABELS[to.panelColor]}`;
  }
  return 'Bildaufteilung geändert';
}

/** What changed on one slide, in the person's words; empty when nothing did. */
function slideChanges(from: SharepicSlide, to: SharepicSlide): string[] {
  const changes: string[] = [];
  const sameShape =
    from.items.length === to.items.length &&
    from.items.every((item, i) => item.type === to.items[i]!.type);
  if (!sameShape) changes.push('neuer Aufbau');
  else {
    from.items.forEach((item, i) => {
      const now = to.items[i]!;
      if (sameSharepicContent(item, now)) return;
      const label = SHAREPIC_ITEM_LABELS[now.type];
      const words = itemWords(now);
      changes.push(
        words !== itemWords(item) && words
          ? `${label} jetzt ${quoted(words)}`
          : `${label} umgestaltet`
      );
    });
  }
  if (!sameSharepicContent(from.background, to.background)) {
    changes.push(backgroundChange(from.background, to.background));
  }
  if (from.position !== to.position) changes.push(`Text jetzt ${POSITION[to.position]}`);
  if (from.align !== to.align) changes.push(`Text jetzt ${ALIGN[to.align]}`);
  changes.push(...fieldChanges(from, to, SLIDE_OWN));
  return changes;
}

const sentence = (parts: string[]) => `${parts.join(', ')}.`;

/** Items whose words come only from the request; the draft may not reword them. */
const QUOTED_TYPES = new Set<SharepicItem['type']>(['zitat']);

function reasonFor(slides: SharepicSlide[]): string | null {
  const items = slides.flatMap((slide) => slide.items);
  if (items.some((item) => QUOTED_TYPES.has(item.type))) {
    return 'Ein Zitat übernehme ich nur wörtlich aus deinem Auftrag – schreib mir den neuen Wortlaut, wenn du ein anderes willst.';
  }
  if (items.some((item) => SHAREPIC_REQUEST_BOUND_ITEMS.has(item.type))) {
    return 'Zahlen, Termine und Schlagzeilen übernehme ich nur so, wie sie in deinem Auftrag stehen.';
  }
  return null;
}

/** Photos and painted images, slide by slide — the things the credits speak about. */
const pictures = (spec: SharepicSpec) =>
  spec.slides.map((slide) => [
    slide.background.kind === 'farbe' ? null : slide.background.filename,
    ...slide.items.flatMap((item) =>
      item.type === 'infografik' ? item.punkte.flatMap((p) => (p.bild ? [p.bild] : [])) : []
    ),
  ]);
/** A new slide on a colour brings no picture; a removed one needs no credit. */
const samePictures = (a: SharepicSpec, b: SharepicSpec) => {
  const was = pictures(a);
  return pictures(b).every((now, i) => sameSharepicContent(now, was[i] ?? [null]));
};

/**
 * The answer after a revision: what actually changed, derived from the specs —
 * never „Erledigt“ when the deck, or the slide the request names, stayed as it was.
 */
export function sharepicRevisionReply(input: {
  before: SharepicSpec;
  after: SharepicSpec;
  /** What the person asked for this turn. */
  order: string;
  /** The draft's own note (a colour it could not take, a field it kept). */
  hinweis: string | null;
  attributions: (SharepicPhotoAttribution | null)[];
}): string {
  const { before, after, order, hinweis, attributions } = input;
  const carousel = before.slides.length > 1 || after.slides.length > 1;
  const perSlide = after.slides.map((slide, i) => {
    const old = before.slides[i];
    return old ? slideChanges(old, slide) : [];
  });
  const deck: string[] = [];
  if (before.slides.length !== after.slides.length) {
    deck.push(`jetzt ${after.slides.length} statt ${before.slides.length} Folien`);
  }
  deck.push(...fieldChanges(before, after, new Set(['slides', 'locale'])));
  const changedSlides = perSlide.flatMap((changes, i) => (changes.length ? [i] : []));
  const describe = (slides: number[]) =>
    [
      ...(deck.length ? [sentence(deck)] : []),
      ...slides.map((i) =>
        carousel ? `Folie ${i + 1}: ${sentence(perSlide[i]!)}` : sentence(perSlide[i]!)
      ),
    ].join(' ');
  const note = hinweis ? ` ${hinweis}` : '';
  const editor = 'öffne das Sharepic im Editor und ändere es dort direkt.';

  const named = carousel ? namedSharepicSlides(order, before.slides) : [];
  const untouched = named.filter((i) => after.slides[i] && !perSlide[i]!.length);
  const nothing = !changedSlides.length && !deck.length;
  const credits = samePictures(before, after)
    ? ''
    : ` ${sharepicSourceNote(after.slides, attributions)}`;
  if (nothing || (named.length && untouched.length === named.length)) {
    const which = untouched.map((i) => i + 1);
    const head = !which.length
      ? 'Am Entwurf hat sich nichts geändert.'
      : `${which.length > 1 ? `Folien ${which.join(', ')} haben` : `Folie ${which[0]} hat`} sich nicht geändert.`;
    const reason = reasonFor(untouched.map((i) => before.slides[i]!));
    const instead = nothing ? '' : ` Geändert hat sich stattdessen ${describe(changedSlides)}`;
    const example = which.length
      ? `„Folie ${which[0]}, Überschrift: …“`
      : carousel
        ? '„Folie 1: Überschrift kürzer“'
        : '„Überschrift kürzer“';
    const ask = reason
      ? `Oder ${editor}`
      : `Beschreib genauer, was anders sein soll – z. B. ${example} – oder ${editor}`;
    return `${head}${instead}${note}${credits}${reason ? ` ${reason}` : ''} ${ask}`;
  }

  const shown = changedSlides.slice(0, 3);
  const more = changedSlides.slice(3).map((i) => i + 1);
  const rest = more.length ? ` Dazu Änderungen auf Folie ${more.join(', ')}.` : '';
  return `Erledigt – ${describe(shown)}${rest}${note}${credits}`;
}
