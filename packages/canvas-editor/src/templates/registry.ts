/**
 * Template registry — the one place that lists every canvas template.
 *
 * The built-in templates and what the editor needs to know about each of them
 * (config loader, host callback keys, how a host's stored state seeds the
 * editor, picker metadata) live in `BUILTIN_TEMPLATES`. `CanvasConfigId`, the
 * loader, the router, `HOST_CALLBACK_KEYS` and `TEMPLATE_REGISTRY` all derive
 * from that list.
 *
 * A host can add its own templates with `registerTemplates(defineTemplate(…))`
 * and mount them through `StandaloneCanvas` by id, or skip the registry and
 * pass a config object directly. The full editor (router, page manager,
 * template picker) still only opens built-in templates.
 *
 * The built-in ids are F0: they are stored in canvases, templates and Y.Docs.
 * Never rename or drop one; `registerTemplates` refuses to replace one.
 */

import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';

import type { BrandLocale } from '../brand/theme';
import type { StockImageAttribution } from '../common/imageSourceTypes';
import type { FullCanvasConfig } from '../configs/types';

// Configs differ in state/action types; the loader hands them out untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCanvasConfig = FullCanvasConfig<any, any>;

/** What any template, built-in or host-registered, must provide. */
export interface TemplateDefinition<TId extends string = string> {
  id: TId;
  /**
   * Loads the template's config, lazily so each template is its own chunk.
   * `formatId` is the canvas's format; only templates that follow the format
   * read it, every other one keeps its own sheet.
   */
  load: (formatId?: string) => Promise<AnyCanvasConfig>;
}

export type TemplateCategory = 'sharepic' | 'slider' | 'profilbild';

/** Which audience a template is offered to. Undefined is treated as 'de-DE'. */
export type TemplateAudience = 'all' | BrandLocale;

/** Picker metadata of a built-in template (see `TemplateInfo`). */
export interface TemplatePickerInfo {
  label: string;
  description: string;
  previewImage: string;
  category: TemplateCategory;
  /** Audience gating — omitted defaults to 'de-DE'. */
  audience?: TemplateAudience;
  /**
   * Lays out on the canvas's own format (see `load`). Without it the
   * template has one fixed 4:5 sheet and belongs only in 4:5 documents.
   */
  followsFormat?: true;
  /** Opened by its own host only (the sticker creator), never offered in a picker. */
  hiddenFromPicker?: true;
}

/** A built-in template: everything the full editor reads about it. */
interface BuiltinTemplateDefinition<TId extends string = string> extends TemplateDefinition<TId> {
  /**
   * The state keys `ControllableCanvasWrapper` declares an `on<Key>Change`
   * callback for. Template text fields and the background image live here;
   * the remaining persisted keys are minted per page
   * (PAGE_PERSISTED_STATE_KEYS). CanvasEditor also mints a page-state writer
   * for each of a page's OWN type, so a page of another template in the deck
   * keeps its text edits.
   */
  hostCallbackKeys: readonly string[];
  /**
   * Maps the host's stored state to the editor's initial props. Absent: the
   * stored state is passed through as is.
   */
  seedProps?: (state: Record<string, unknown>, imageSrc?: string) => Record<string, unknown>;
  info: TemplatePickerInfo;
}

/**
 * Declares a host template. Identity at runtime; it keeps the id literal so a
 * host can derive its own id union the same way `CanvasConfigId` is derived.
 */
export function defineTemplate<const TId extends string>(
  definition: TemplateDefinition<TId>
): TemplateDefinition<TId> {
  return definition;
}

function defineBuiltin<const TId extends string>(
  definition: BuiltinTemplateDefinition<TId>
): BuiltinTemplateDefinition<TId> {
  return definition;
}

// ----------------------------------------------------------------------------
// Seeding: how a host's stored state becomes the editor's initial props
// ----------------------------------------------------------------------------

/**
 * Background-image state that persists alongside the image so the position,
 * zoom, opacity and Unsplash credit all survive a reload — not just the URL.
 * Optional because legacy saves and non-image layouts omit them.
 */
interface BackgroundImageProps {
  imageOffset?: { x: number; y: number };
  imageScale?: number;
  backgroundImageOpacity?: number;
  imageAttribution?: StockImageAttribution | null;
}

/**
 * Per-template shape of the props seeded into the inner CanvasEditor.
 *
 * Every `seedProps` below is `satisfies`-checked against its entry here — so
 * dropping or mistyping a field (e.g. forgetting to thread a background URL)
 * is a compile error rather than a silent runtime '' fallback.
 */
export interface CanvasInitialPropsMap {
  zitat: { quote: string; name: string; imageSrc: string } & BackgroundImageProps;
  'zitat-pure': { quote: string; name: string };
  info: { header: string; body: string };
  veranstaltung: VeranstaltungInitialProps;
  simple: { headline: string; subtext: string; imageSrc: string } & BackgroundImageProps;
  slider: { label: string; headline: string; subtext: string };
  dreizeilen: {
    line1: string;
    line2: string;
    line3: string;
    currentImageSrc: string;
  } & BackgroundImageProps;
  freeform: {
    backgroundMode: string;
    backgroundColor: string;
    currentImageSrc: string;
  } & BackgroundImageProps;
  profilbild: { transparentImage: string; backgroundColor: string };
  // Österreich (de-AT) variants — field sets mirror CANVAS_TYPE_FIELDS in the studio
  'zitat-at': { quote: string; name: string; imageSrc: string } & BackgroundImageProps;
  'zitat-pure-at': { quote: string; name: string };
  'dreizeilen-overlay-at': {
    line1: string;
    accent: string;
    line3: string;
    subline: string;
    currentImageSrc: string;
  } & BackgroundImageProps;
  'info-at': { introline: string; text: string; accent: string };
  'slider-at': { label: string; headline: string; subtext: string };
  // backgroundColor omitted when unset so the AT config's CI default applies
  'freeform-at': {
    backgroundMode: string;
    backgroundColor?: string;
    currentImageSrc: string;
  } & BackgroundImageProps;
}

interface VeranstaltungInitialProps extends BackgroundImageProps {
  eventTitle: string;
  beschreibung: string;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address: string;
  imageSrc: string;
}

type State = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// The persisted background lives under `currentImageSrc` for every type;
// some types surface it to the inner canvas as `imageSrc`. Fall back across
// both (and the legacy `imageSrc` prop) so saves from either key re-hydrate.
const bgSrc = (state: State, imageSrc?: string): string =>
  str(state.currentImageSrc) || str(state.imageSrc) || imageSrc || '';

// Image transform/opacity/credit that persist alongside the URL.
const bgImageProps = (state: State): BackgroundImageProps => ({
  imageOffset: state.imageOffset as { x: number; y: number } | undefined,
  imageScale: state.imageScale as number | undefined,
  backgroundImageOpacity: state.backgroundImageOpacity as number | undefined,
  imageAttribution: (state.imageAttribution as StockImageAttribution | null | undefined) ?? null,
});

const seedQuoteOnImage = (s: State, imageSrc?: string) =>
  ({
    quote: str(s.quote),
    name: str(s.name),
    imageSrc: bgSrc(s, imageSrc),
    ...bgImageProps(s),
  }) satisfies CanvasInitialPropsMap['zitat'] & CanvasInitialPropsMap['zitat-at'];

const seedQuote = (s: State) =>
  ({
    quote: str(s.quote),
    name: str(s.name),
  }) satisfies CanvasInitialPropsMap['zitat-pure'] & CanvasInitialPropsMap['zitat-pure-at'];

const seedSlider = (s: State) =>
  ({
    label: str(s.label),
    headline: str(s.headline),
    subtext: str(s.subtext),
  }) satisfies CanvasInitialPropsMap['slider'] & CanvasInitialPropsMap['slider-at'];

// ----------------------------------------------------------------------------
// The built-in templates
// ----------------------------------------------------------------------------

// Every `load` carries its return type: the config modules' own types mention
// CanvasConfigId, and inferring it from the import would make the id union
// depend on itself.

// Background-image fields that must sync back to the collab doc when changed
// in-editor (GenericCanvas emits the matching on<Key>Change). Without these
// the chosen image — and its position/zoom/opacity/credit — is local-only
// and lost on reload. `currentImageSrc` is the persisted key for every type.
const BG_IMAGE_KEYS = [
  'currentImageSrc',
  'imageOffset',
  'imageScale',
  'backgroundImageOpacity',
  'imageAttribution',
] as const;

/**
 * Every built-in template, in the order the picker lists them.
 */
export const BUILTIN_TEMPLATES = [
  defineBuiltin({
    id: 'dreizeilen',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/dreizeilen_full.config')).dreizeilenFullConfig,
    hostCallbackKeys: ['line1', 'line2', 'line3', ...BG_IMAGE_KEYS],
    seedProps: (s, imageSrc) =>
      ({
        line1: str(s.line1),
        line2: str(s.line2),
        line3: str(s.line3),
        currentImageSrc: bgSrc(s, imageSrc),
        ...bgImageProps(s),
      }) satisfies CanvasInitialPropsMap['dreizeilen'],
    info: {
      label: '3 Zeilen',
      description: 'Drei Textzeilen auf Foto oder Farbfläche',
      previewImage: '/imagine/previews/dreizeilen-preview.webp',
      category: 'sharepic',
    },
  }),
  defineBuiltin({
    id: 'zitat',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/zitat_full.config')).zitatFullConfig,
    hostCallbackKeys: ['quote', 'name', ...BG_IMAGE_KEYS],
    seedProps: seedQuoteOnImage,
    info: {
      label: 'Zitat',
      description: 'Zitat auf Foto oder Farbfläche',
      previewImage: '/imagine/previews/zitat-preview.webp',
      category: 'sharepic',
    },
  }),
  defineBuiltin({
    id: 'zitat-pure',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/zitat_pure_full.config')).zitatPureFullConfig,
    hostCallbackKeys: ['quote', 'name', ...BG_IMAGE_KEYS],
    seedProps: seedQuote,
    info: {
      label: 'Zitat Pur',
      description: 'Zitat auf Farbfläche oder Foto',
      previewImage: '/imagine/previews/zitat-pure-preview.webp',
      category: 'sharepic',
    },
  }),
  defineBuiltin({
    id: 'simple',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/simple_full.config')).simpleFullConfig,
    hostCallbackKeys: ['headline', 'subtext', ...BG_IMAGE_KEYS],
    seedProps: (s, imageSrc) =>
      ({
        headline: str(s.headline),
        subtext: str(s.subtext),
        imageSrc: bgSrc(s, imageSrc),
        ...bgImageProps(s),
      }) satisfies CanvasInitialPropsMap['simple'],
    info: {
      label: 'Einfach',
      description: 'Überschrift und Unterzeile auf Foto oder Farbfläche',
      previewImage: '/imagine/previews/simple-preview.webp',
      category: 'sharepic',
    },
  }),
  defineBuiltin({
    id: 'info',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/info_full.config')).infoFullConfig,
    hostCallbackKeys: ['header', 'body', ...BG_IMAGE_KEYS],
    seedProps: (s) =>
      ({
        header: str(s.header),
        body: str(s.body),
      }) satisfies CanvasInitialPropsMap['info'],
    info: {
      label: 'Info',
      description: 'Überschrift und Text auf Farbfläche oder Foto',
      previewImage: '/imagine/previews/info-preview.webp',
      category: 'sharepic',
    },
  }),
  defineBuiltin({
    id: 'veranstaltung',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/veranstaltung_full.config')).veranstaltungFullConfig,
    hostCallbackKeys: ['eventTitle', 'beschreibung', ...BG_IMAGE_KEYS],
    seedProps: (s, imageSrc) =>
      ({
        eventTitle: str(s.eventTitle),
        beschreibung: str(s.beschreibung),
        weekday: str(s.weekday),
        date: str(s.date),
        time: str(s.time),
        locationName: str(s.locationName),
        address: str(s.address),
        imageSrc: bgSrc(s, imageSrc),
        ...bgImageProps(s),
      }) satisfies CanvasInitialPropsMap['veranstaltung'],
    info: {
      label: 'Event',
      description: 'Veranstaltungsankündigung',
      previewImage: '/imagine/previews/veranstaltung-preview.webp',
      category: 'sharepic',
    },
  }),
  defineBuiltin({
    id: 'slider',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/slider_full.config')).sliderFullConfig,
    hostCallbackKeys: ['label', 'headline', 'subtext', ...BG_IMAGE_KEYS],
    seedProps: seedSlider,
    info: {
      label: 'Slider',
      description: 'Slider-Post mit Pill-Badge und Pfeil',
      previewImage: '/imagine/previews/slider-preview.webp',
      category: 'slider',
    },
  }),
  defineBuiltin({
    id: 'freeform',
    load: async (formatId): Promise<AnyCanvasConfig> =>
      (await import('../configs/freeform_full.config')).createFreeformFullConfig(
        getCanvasFormatOrDefault(formatId)
      ),
    // backgroundMode must persist alongside the image — the background image
    // element only renders when backgroundMode === 'image'.
    hostCallbackKeys: ['backgroundMode', ...BG_IMAGE_KEYS],
    seedProps: (s, imageSrc) =>
      ({
        backgroundMode: str(s.backgroundMode) || 'color',
        backgroundColor: str(s.backgroundColor) || '#005538',
        currentImageSrc: bgSrc(s, imageSrc),
        ...bgImageProps(s),
      }) satisfies CanvasInitialPropsMap['freeform'],
    info: {
      label: 'Freies Design',
      description: 'Leere Leinwand zum freien Gestalten',
      previewImage: '/imagine/previews/freeform-preview.webp',
      category: 'sharepic',
      followsFormat: true,
    },
  }),
  defineBuiltin({
    id: 'profilbild',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/profilbild_full.config')).profilbildFullConfig,
    hostCallbackKeys: [],
    seedProps: (s, imageSrc) =>
      ({
        transparentImage: str(s.transparentImage) || imageSrc || '',
        backgroundColor: str(s.backgroundColor),
      }) satisfies CanvasInitialPropsMap['profilbild'],
    info: {
      label: 'Profilbild',
      description: 'Profilbild mit transparentem Vordergrund auf farbigem Hintergrund',
      previewImage: '/imagine/previews/profilbild-preview.webp',
      category: 'profilbild',
    },
  }),
  defineBuiltin({
    id: 'sticker',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/sticker_full.config')).stickerFullConfig,
    // Inherits freeform's state; its background keys are unused (no background plane).
    hostCallbackKeys: ['backgroundMode', ...BG_IMAGE_KEYS],
    // No seedProps: the sticker creator's state is passed through as is.
    info: {
      label: 'Sticker',
      description: 'Transparente Fläche für einen Sticker',
      previewImage: '/imagine/previews/freeform-preview.webp',
      category: 'profilbild',
      audience: 'all',
      hiddenFromPicker: true,
    },
  }),

  // Österreich (de-AT) variants — kein Info-Sujet, das gibt es nur für de-DE
  defineBuiltin({
    id: 'zitat-at',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/zitat_at_full.config')).zitatAtFullConfig,
    hostCallbackKeys: ['quote', 'name', ...BG_IMAGE_KEYS],
    seedProps: seedQuoteOnImage,
    info: {
      label: 'Zitat',
      description: 'Zitat auf Foto oder Farbfläche (Österreich)',
      previewImage: '/imagine/previews/zitat-at-preview.webp',
      category: 'sharepic',
      audience: 'de-AT',
    },
  }),
  defineBuiltin({
    id: 'zitat-pure-at',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/zitat_pure_at_full.config')).zitatPureAtFullConfig,
    hostCallbackKeys: ['quote', 'name', ...BG_IMAGE_KEYS],
    seedProps: seedQuote,
    info: {
      label: 'Zitat Pur',
      description: 'Zitat auf Farbfläche oder Foto (Österreich)',
      previewImage: '/imagine/previews/zitat-pure-at-preview.webp',
      category: 'sharepic',
      audience: 'de-AT',
    },
  }),
  defineBuiltin({
    id: 'dreizeilen-overlay-at',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/dreizeilen_overlay_at_full.config')).dreizeilenOverlayAtFullConfig,
    hostCallbackKeys: ['line1', 'accent', 'line3', 'subline', ...BG_IMAGE_KEYS],
    seedProps: (s, imageSrc) =>
      ({
        line1: str(s.line1),
        accent: str(s.accent),
        line3: str(s.line3),
        subline: str(s.subline),
        currentImageSrc: bgSrc(s, imageSrc),
        ...bgImageProps(s),
      }) satisfies CanvasInitialPropsMap['dreizeilen-overlay-at'],
    info: {
      label: '3 Zeilen',
      description: 'Dreizeilige Headline auf Farbfläche über einem Foto (Österreich)',
      previewImage: '/imagine/previews/dreizeilen-overlay-at-preview.webp',
      category: 'sharepic',
      audience: 'de-AT',
    },
  }),
  defineBuiltin({
    id: 'info-at',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/info_at_full.config')).infoAtFullConfig,
    hostCallbackKeys: ['introline', 'text', 'accent', ...BG_IMAGE_KEYS],
    seedProps: (s) =>
      ({
        introline: str(s.introline),
        text: str(s.text),
        accent: str(s.accent),
      }) satisfies CanvasInitialPropsMap['info-at'],
    info: {
      label: 'Info',
      description:
        'Introline, Infotext und gelbe Schlusszeile auf Farbfläche oder Foto (Österreich)',
      previewImage: '/imagine/previews/info-at-preview.webp',
      category: 'sharepic',
      audience: 'de-AT',
    },
  }),
  defineBuiltin({
    id: 'freeform-at',
    load: async (formatId): Promise<AnyCanvasConfig> =>
      (await import('../configs/freeform_at_full.config')).createFreeformAtFullConfig(
        getCanvasFormatOrDefault(formatId)
      ),
    hostCallbackKeys: ['backgroundMode', 'backgroundColor', ...BG_IMAGE_KEYS],
    seedProps: (s, imageSrc) => {
      const backgroundColor = str(s.backgroundColor);
      return {
        backgroundMode: str(s.backgroundMode) || 'color',
        ...(backgroundColor ? { backgroundColor } : {}),
        currentImageSrc: bgSrc(s, imageSrc),
        ...bgImageProps(s),
      } satisfies CanvasInitialPropsMap['freeform-at'];
    },
    info: {
      label: 'Freies Design',
      description: 'Leere Leinwand mit österreichischem CI',
      previewImage: '/imagine/previews/freeform-preview.webp',
      category: 'sharepic',
      audience: 'de-AT',
      followsFormat: true,
    },
  }),
  defineBuiltin({
    id: 'slider-at',
    load: async (): Promise<AnyCanvasConfig> =>
      (await import('../configs/slider_full.config')).sliderAtFullConfig,
    hostCallbackKeys: ['label', 'headline', 'subtext', ...BG_IMAGE_KEYS],
    seedProps: seedSlider,
    info: {
      label: 'Slider',
      description: 'Slider-Post mit Label, Pfeil und Logo (Österreich)',
      previewImage: '/imagine/previews/slider-preview.webp',
      category: 'slider',
      audience: 'de-AT',
    },
  }),
] as const;

/** The built-in template ids (F0). */
export type CanvasConfigId = (typeof BUILTIN_TEMPLATES)[number]['id'];

/** A built-in id or the id of a host-registered template. */
export type TemplateId = CanvasConfigId | (string & {});

const BUILTIN_BY_ID = new Map<string, BuiltinTemplateDefinition<CanvasConfigId>>(
  BUILTIN_TEMPLATES.map((t) => [t.id, t])
);

const hostTemplates = new Map<string, TemplateDefinition>();

/** Is this one of the built-in template ids? Host templates are not. */
export function isValidCanvasType(type: string): type is CanvasConfigId {
  return BUILTIN_BY_ID.has(type);
}

export function getBuiltinTemplate(id: CanvasConfigId): BuiltinTemplateDefinition<CanvasConfigId> {
  return BUILTIN_BY_ID.get(id)!;
}

/** A built-in or host-registered template, or undefined. */
export function getTemplate(id: string): TemplateDefinition | undefined {
  return BUILTIN_BY_ID.get(id) ?? hostTemplates.get(id);
}

/**
 * Adds host templates to the registry. An id may be registered once; a
 * built-in id can never be replaced (it is stored in users' canvases).
 * Registering the same definition again is a no-op.
 */
export function registerTemplates(...definitions: TemplateDefinition[]): void {
  for (const definition of definitions) {
    const existing = getTemplate(definition.id);
    if (existing === definition) continue;
    if (existing) throw new Error(`Template "${definition.id}" is already registered`);
    hostTemplates.set(definition.id, definition);
  }
}
