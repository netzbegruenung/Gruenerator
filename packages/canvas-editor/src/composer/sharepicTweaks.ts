import {
  SHAREPIC_COLOR_LABELS,
  SHAREPIC_LOCALE_COLORS,
  sharepicAufrufStilSchema,
  sharepicChartKindSchema,
  type SharepicColor,
  type SharepicItem,
  sharepicListeStilSchema,
  type SharepicSlide,
  type SharepicSpec,
  sharepicSpecSchema,
  sharepicZahlStilSchema,
} from '@gruenerator/contracts';

import { SHAREPIC_COLOR_HEX } from './composeSharepic';

/**
 * Design variations of a finished draft: the same content in another look,
 * switched without the model. A choice is applied to the draft as the AI left
 * it, never to the last variation — switching back restores what an earlier
 * choice had to drop (a `weiter` teaser without the arrow).
 */
const NAVIGATION = ['keine', 'pfeil', 'pfeil-punkte', 'pfeil-bruch', 'bruch'] as const;
const NUMMER = ['aus', 'gross', 'geist'] as const;
const AN_AUS = ['an', 'aus'] as const;
const SCHLAGZEILE = ['ausriss', 'karte'] as const;
/** Every slide in one colour, or dark and light taking turns. */
const WECHSEL = 'wechsel';

const TWEAKS = {
  farbe: { label: 'Farbe' },
  zeilenboxen: { label: 'Zeilenboxen' },
  navigation: { label: 'Navigation' },
  nummer: { label: 'Nummerierung' },
  aufruf: { label: 'Schluss-Slide' },
  liste: { label: 'Liste' },
  zahl: { label: 'Zahl' },
  schlagzeile: { label: 'Schlagzeile' },
  diagramm: { label: 'Diagramm' },
} as const;
export type SharepicTweakId = keyof typeof TWEAKS;
const TWEAK_IDS = Object.keys(TWEAKS) as SharepicTweakId[];

/** The person's choices, by axis. Absent: as drafted. */
export type SharepicTweakChoice = Partial<Record<SharepicTweakId, string>>;

export interface SharepicTweakOption {
  value: string;
  label: string;
  /** Compact text for a chip that has little room. */
  short: string;
  /** Would break a rule of the spec together with the other choices. */
  disabled: boolean;
  /** Brand colours of a colour option, as the chip shows them. */
  swatch?: string[];
}

export interface SharepicTweak {
  id: SharepicTweakId;
  label: string;
  /** The value the shown design has; null when the draft mixes several. */
  value: string | null;
  options: SharepicTweakOption[];
}

const LABELS: Record<string, string> = {
  ...SHAREPIC_COLOR_LABELS,
  [WECHSEL]: 'Hell und dunkel im Wechsel',
  keine: 'Keine',
  pfeil: 'Pfeil',
  'pfeil-punkte': 'Pfeil und Punkte',
  'pfeil-bruch': 'Pfeil und 2/5',
  bruch: 'Nur 2/5',
  aus: 'Aus',
  an: 'An',
  gross: 'Große Ziffer',
  geist: 'Ziffer im Hintergrund',
  ausruf: 'Ausruf',
  kernsatz: 'Kernsatz',
  petition: 'Petition',
  punkte: 'Punkte',
  ziffern: 'Ziffern',
  pfeile: 'Pfeile',
  haken: 'Haken',
  stapel: 'Zahl über Text',
  riesenwort: 'Riesenzahl',
  countdown: 'Countdown',
  ausriss: 'Ausriss',
  karte: 'Karte',
  balken: 'Balken',
  'balken-quer': 'Balken quer',
  linie: 'Linie',
  kreis: 'Kreis',
  donut: 'Donut',
};

type OptionValue =
  | SharepicColor
  | typeof WECHSEL
  | (typeof NAVIGATION)[number]
  | (typeof NUMMER)[number]
  | (typeof AN_AUS)[number]
  | (typeof SCHLAGZEILE)[number]
  | (typeof sharepicAufrufStilSchema.options)[number]
  | (typeof sharepicListeStilSchema.options)[number]
  | (typeof sharepicZahlStilSchema.options)[number]
  | (typeof sharepicChartKindSchema.options)[number];

const SHORT: Record<OptionValue, string> = {
  ...SHAREPIC_COLOR_LABELS,
  [WECHSEL]: 'Wechsel',
  keine: 'Aus',
  pfeil: '→',
  'pfeil-punkte': '→ •••',
  'pfeil-bruch': '→ 2/5',
  bruch: '2/5',
  aus: 'Aus',
  an: 'An',
  gross: 'Groß',
  geist: 'Geist',
  ausruf: 'Ausruf',
  kernsatz: 'Kernsatz',
  petition: 'Petition',
  punkte: '•',
  ziffern: '1.',
  pfeile: '→',
  haken: '✓',
  stapel: 'Stapel',
  riesenwort: 'Riese',
  countdown: 'Countdown',
  ausriss: 'Ausriss',
  karte: 'Karte',
  balken: 'Balken',
  'balken-quer': 'Quer',
  linie: 'Linie',
  kreis: 'Kreis',
  donut: 'Donut',
};

/** Dark and light for the alternating scheme, per locale. */
const ALTERNATING: Record<SharepicSpec['locale'], [SharepicColor, SharepicColor]> = {
  'de-DE': ['dunkeltanne', 'mint'],
  'de-AT': ['dunkelgruen', 'weiss'],
};

const isCarousel = (spec: SharepicSpec) => spec.slides.length > 1;
const hasItem = (spec: SharepicSpec, type: SharepicItem['type']) =>
  spec.slides.some((slide) => slide.items.some((i) => i.type === type));
const slideColor = (slide: SharepicSlide): SharepicColor | null =>
  slide.background.kind === 'farbe'
    ? slide.background.color
    : slide.background.kind === 'foto'
      ? null
      : slide.background.panelColor;
/** An infographic is painted for a light ground; its slide keeps it. */
const keepsGround = (slide: SharepicSlide) => slide.items.some((i) => i.type === 'infografik');
/** Slides whose colour a scheme sets, in order. */
const coloured = (spec: SharepicSpec) =>
  spec.slides.filter((slide) => slideColor(slide) !== null && !keepsGround(slide));
/** The text the line boxes set: headline and paragraphs. */
const boxable = (slide: SharepicSlide) =>
  slide.items.some((i) => i.type === 'headline' || i.type === 'absatz' || i.type === 'text');

/**
 * The slides that are a carousel's points. The draft's own numbering wins;
 * without it, the slides of the most common build between cover and close
 * ("3 Gründe": the three headline-and-paragraph slides, not the intro).
 */
function pointSlides(spec: SharepicSpec): number[] {
  const numbered = spec.slides.flatMap((s, k) => (s.nummer ? [k] : []));
  if (numbered.length) return numbered;
  const candidates = spec.slides.flatMap((s, k) =>
    k > 0 && !s.items.some((i) => i.type === 'aufruf') ? [k] : []
  );
  const build = (k: number) =>
    spec.slides[k]!.items.map((i) => i.type)
      .sort()
      .join('+');
  const counts = new Map<string, number>();
  for (const k of candidates) counts.set(build(k), (counts.get(build(k)) ?? 0) + 1);
  const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return n >= 2 ? candidates.filter((k) => build(k) === top) : [];
}

function options(id: SharepicTweakId, spec: SharepicSpec): readonly string[] {
  switch (id) {
    case 'farbe':
      return coloured(spec).length
        ? [...SHAREPIC_LOCALE_COLORS[spec.locale], ...(coloured(spec).length > 1 ? [WECHSEL] : [])]
        : [];
    case 'zeilenboxen':
      return spec.locale === 'de-DE' && spec.slides.some(boxable) ? AN_AUS : [];
    case 'navigation':
      return isCarousel(spec) ? NAVIGATION : [];
    case 'nummer':
      return isCarousel(spec) && pointSlides(spec).length >= 2 ? NUMMER : [];
    case 'aufruf':
      return hasItem(spec, 'aufruf') ? sharepicAufrufStilSchema.options : [];
    case 'liste':
      return hasItem(spec, 'liste') ? sharepicListeStilSchema.options : [];
    case 'zahl':
      return hasItem(spec, 'zahl') ? sharepicZahlStilSchema.options : [];
    case 'schlagzeile':
      return hasItem(spec, 'schlagzeile') ? SCHLAGZEILE : [];
    case 'diagramm':
      return hasItem(spec, 'diagramm') ? sharepicChartKindSchema.options : [];
  }
}

/** Items of one type, each changed by `f`; the rest of the spec as it is. */
function mapItems(spec: SharepicSpec, f: (item: SharepicItem) => SharepicItem): SharepicSpec {
  return { ...spec, slides: spec.slides.map((s) => ({ ...s, items: s.items.map(f) })) };
}

/** A figure the countdown disc holds: a short whole number. */
const countable = (wert: string) => /^\d{1,3}$/.test(wert.trim());
/** A line runs over time: every name is a year or a date. */
const overTime = (names: string[]) => names.every((n) => /\d{4}|\d{1,2}\.\d{1,2}\./.test(n));

function apply(spec: SharepicSpec, id: SharepicTweakId, value: string): SharepicSpec {
  switch (id) {
    case 'farbe': {
      const turns = ALTERNATING[spec.locale];
      let k = 0;
      return {
        ...spec,
        slides: spec.slides.map((slide) => {
          if (slideColor(slide) === null || keepsGround(slide)) return slide;
          const color = (value === WECHSEL ? turns[k++ % 2] : value) as SharepicColor;
          const bg = slide.background;
          return {
            ...slide,
            background:
              bg.kind === 'farbe'
                ? { ...bg, color }
                : bg.kind === 'foto'
                  ? bg
                  : { ...bg, panelColor: color },
          };
        }),
      };
    }
    case 'zeilenboxen':
      return {
        ...spec,
        slides: spec.slides.map((slide) => {
          if (!boxable(slide)) return slide;
          const { zeilenboxen: _, ...rest } = slide;
          return value === 'an' ? { ...rest, zeilenboxen: true } : rest;
        }),
      };
    case 'navigation': {
      const { pfeil: _p, seitenzahl: _s, ...rest } = spec;
      const arrow = value.startsWith('pfeil');
      const seitenzahl = value.endsWith('punkte')
        ? 'punkte'
        : value.endsWith('bruch')
          ? 'bruch'
          : null;
      return {
        ...rest,
        ...(arrow ? {} : { pfeil: false }),
        ...(seitenzahl ? { seitenzahl } : {}),
        // The teaser stands beside the arrow: without one, it goes.
        slides: arrow ? spec.slides : spec.slides.map(({ weiter: _w, ...slide }) => slide),
      };
    }
    case 'nummer': {
      const points = new Set(pointSlides(spec));
      return {
        ...spec,
        slides: spec.slides.map((slide, k) => {
          const { nummer: _, ...rest } = slide;
          return value !== 'aus' && points.has(k)
            ? { ...rest, nummer: value as 'gross' | 'geist' }
            : rest;
        }),
      };
    }
    case 'aufruf':
      return mapItems(spec, (i) =>
        i.type === 'aufruf' ? { ...i, stil: sharepicAufrufStilSchema.parse(value) } : i
      );
    case 'liste':
      return mapItems(spec, (i) =>
        i.type === 'liste' ? { ...i, stil: sharepicListeStilSchema.parse(value) } : i
      );
    case 'zahl':
      return mapItems(spec, (i) =>
        i.type === 'zahl' ? { ...i, stil: sharepicZahlStilSchema.parse(value) } : i
      );
    case 'schlagzeile':
      return mapItems(spec, (i) =>
        i.type === 'schlagzeile' ? { ...i, stil: value === 'karte' ? 'karte' : 'ausriss' } : i
      );
    case 'diagramm':
      return mapItems(spec, (i) =>
        i.type === 'diagramm' ? { ...i, art: sharepicChartKindSchema.parse(value) } : i
      );
  }
}

/** What a variation changes beyond the spec's own rules: a look that would mislead. */
function fits(spec: SharepicSpec, id: SharepicTweakId, value: string): boolean {
  const items = spec.slides.flatMap((s) => s.items);
  switch (id) {
    case 'aufruf':
      // The petition's mark is its hint — where to sign.
      return value !== 'petition' || items.some((i) => i.type === 'aufruf' && !!i.hinweis);
    case 'zahl':
      return value !== 'countdown' || items.every((i) => i.type !== 'zahl' || countable(i.wert));
    case 'diagramm':
      return (
        value !== 'linie' ||
        items.every((i) => i.type !== 'diagramm' || overTime(i.werte.map((w) => w.name)))
      );
    default:
      return true;
  }
}

/** The draft with every choice applied, in a fixed order. */
export function applySharepicTweaks(base: SharepicSpec, choice: SharepicTweakChoice): SharepicSpec {
  return TWEAK_IDS.reduce((spec, id) => {
    const value = choice[id];
    return value !== undefined && options(id, base).includes(value) ? apply(spec, id, value) : spec;
  }, base);
}

/** The value a spec shows on one axis; null when its slides or items differ. */
function current(spec: SharepicSpec, id: SharepicTweakId): string | null {
  const one = (values: string[]) =>
    values.length && values.every((v) => v === values[0]) ? values[0]! : null;
  const items = spec.slides.flatMap((s) => s.items);
  switch (id) {
    case 'farbe': {
      const colours = coloured(spec).map((s) => slideColor(s)!);
      const turns = ALTERNATING[spec.locale];
      if (colours.length > 1 && colours.every((c, k) => c === turns[k % 2])) return WECHSEL;
      return one(colours);
    }
    case 'zeilenboxen':
      return one(spec.slides.filter(boxable).map((s) => (s.zeilenboxen ? 'an' : 'aus')));
    case 'navigation': {
      const arrow = spec.pfeil !== false;
      if (!spec.seitenzahl) return arrow ? 'pfeil' : 'keine';
      if (arrow) return spec.seitenzahl === 'punkte' ? 'pfeil-punkte' : 'pfeil-bruch';
      return spec.seitenzahl === 'bruch' ? 'bruch' : null;
    }
    case 'nummer': {
      const points = pointSlides(spec);
      return one(points.map((k) => spec.slides[k]!.nummer ?? 'aus'));
    }
    case 'aufruf':
      return one(items.flatMap((i) => (i.type === 'aufruf' ? [i.stil] : [])));
    case 'liste':
      return one(items.flatMap((i) => (i.type === 'liste' ? [i.stil ?? 'punkte'] : [])));
    case 'zahl':
      return one(items.flatMap((i) => (i.type === 'zahl' ? [i.stil] : [])));
    case 'schlagzeile':
      return one(items.flatMap((i) => (i.type === 'schlagzeile' ? [i.stil] : [])));
    case 'diagramm':
      return one(items.flatMap((i) => (i.type === 'diagramm' ? [i.art] : [])));
  }
}

/**
 * The variations a draft offers, each with the value shown now. An option that
 * would break the spec's rules together with the other choices is disabled,
 * not hidden, so the row keeps its shape while the person switches.
 */
export function sharepicTweaks(base: SharepicSpec, choice: SharepicTweakChoice): SharepicTweak[] {
  const shown = applySharepicTweaks(base, choice);
  return TWEAK_IDS.flatMap((id) => {
    const values = options(id, base);
    if (!values.length) return [];
    return [
      {
        id,
        label: TWEAKS[id].label,
        value: current(shown, id),
        options: values.map((value) => {
          const spec = applySharepicTweaks(base, { ...choice, [id]: value });
          return {
            value,
            label: LABELS[value] ?? value,
            short: SHORT[value as OptionValue],
            disabled: !fits(base, id, value) || !sharepicSpecSchema.safeParse(spec).success,
            ...(id === 'farbe'
              ? {
                  swatch: (value === WECHSEL
                    ? ALTERNATING[base.locale]
                    : [value as SharepicColor]
                  ).map((c) => SHAREPIC_COLOR_HEX[c]),
                }
              : {}),
          };
        }),
      },
    ];
  });
}
