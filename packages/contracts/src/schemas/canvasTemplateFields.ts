/**
 * Single source of truth for per-template sharepic knowledge: which store
 * fields seed a canvas `initial_state`, which image key it uses, what the
 * template is called in the UI, and how the chat generator's sharepic types
 * map onto canvas template types.
 *
 * This used to live in four places that drifted independently:
 *  - `CANVAS_TYPE_FIELDS` in `apps/web/.../utils/canvasTypeFields.ts` (fields/image),
 *  - `VARIANT_LABEL_BY_CANVAS_TYPE` + the gen/AT maps in the API's
 *    `sharepicVariantHelpers.ts`,
 *  - `FALLBACK_LABELS` in `packages/chat/.../useSharepicArtifact.ts`,
 *  - the per-type `switch` in `buildInitialPropsForType`.
 *
 * Contracts is the right home because all three consumers (web studio, API chat
 * path, chat UI) already depend on it for `CanvasTemplateType` itself.
 */
import { type CanvasTemplateType } from './canvasTemplateDescriptors.js';

/** Store fields that can seed a canvas `initial_state`. */
export type CanvasFormField =
  | 'line1'
  | 'line2'
  | 'line3'
  | 'quote'
  | 'name'
  | 'header'
  | 'body'
  | 'headline'
  | 'accent'
  | 'introline'
  | 'text'
  | 'subline'
  | 'subtext'
  | 'label'
  | 'eventTitle'
  | 'beschreibung'
  | 'weekday'
  | 'date'
  | 'time'
  | 'locationName'
  | 'address';

export interface CanvasImageConfig {
  /**
   * Key under which the resolved image URL is written into `initial_state`.
   *
   * Two spellings exist and both are persisted prop names (F1 — not renamed):
   * `currentImageSrc` for the templates whose config derives
   * `hasBackgroundImage` from it, `imageSrc` for the ones that take the photo
   * as a plain source. The factories translate; do not "unify" these.
   */
  key: string;
  /** Where the source image comes from in the studio store. */
  source: 'upload' | 'transparent';
  /** Whether the template cannot render without the image. */
  required: boolean;
}

export interface CanvasTypeFields {
  fields: readonly CanvasFormField[];
  image?: CanvasImageConfig;
  /** German display name, shared by a template and its Austrian variant. */
  label: string;
}

export const CANVAS_TEMPLATE_FIELDS = {
  dreizeilen: {
    fields: ['line1', 'line2', 'line3'],
    image: { key: 'currentImageSrc', source: 'upload', required: false },
    label: 'Dreizeiler',
  },
  zitat: {
    fields: ['quote', 'name'],
    image: { key: 'imageSrc', source: 'upload', required: true },
    label: 'Zitat',
  },
  'zitat-pure': {
    fields: ['quote', 'name'],
    label: 'Zitat',
  },
  info: {
    fields: ['header', 'body'],
    label: 'Info',
  },
  veranstaltung: {
    fields: ['eventTitle', 'beschreibung', 'weekday', 'date', 'time', 'locationName', 'address'],
    image: { key: 'imageSrc', source: 'upload', required: true },
    label: 'Veranstaltung',
  },
  simple: {
    fields: ['headline', 'subtext'],
    image: { key: 'imageSrc', source: 'upload', required: true },
    label: 'Sharepic',
  },
  slider: {
    // `subtext2` is a real slide field in the deck config but deliberately NOT
    // listed: `buildInitialState` seeds `state[field] ?? ''` for every entry
    // here, so listing it would write an empty string into every minted deck
    // and clobber the config default. The parity guard allowlists it.
    fields: ['label', 'headline', 'subtext'],
    label: 'Slider',
  },
  profilbild: {
    fields: [],
    image: { key: 'transparentImage', source: 'transparent', required: true },
    label: 'Profilbild',
  },
  freeform: {
    fields: [],
    label: 'Freeform',
  },
  // Österreich (de-AT) variants — sie teilen sich die Labels mit dem jeweiligen
  // deutschen Sujet: im UI steht neben der Variante ohnehin schon, dass es die
  // österreichische Fassung ist.
  'zitat-at': {
    fields: ['quote', 'name'],
    image: { key: 'imageSrc', source: 'upload', required: true },
    label: 'Zitat',
  },
  'zitat-pure-at': {
    fields: ['quote', 'name'],
    label: 'Zitat',
  },
  'dreizeilen-overlay-at': {
    fields: ['line1', 'accent', 'line3', 'subline'],
    image: { key: 'currentImageSrc', source: 'upload', required: false },
    label: 'Dreizeiler',
  },
  'info-at': {
    fields: ['introline', 'text', 'accent'],
    label: 'Info',
  },
  'freeform-at': {
    fields: [],
    label: 'Freeform',
  },
  // `Record<CanvasTemplateType, …>` (NOT Partial) ties these keys to the
  // canonical enum: adding a mintable type without adding it to
  // CANVAS_TEMPLATE_TYPES — or vice versa — is a compile error. This keeps
  // `isMintableCanvasType`'s `type is CanvasTemplateType` narrowing sound.
} satisfies Record<CanvasTemplateType, CanvasTypeFields>;

/**
 * Studio types that can be minted into a single collaborative canvas document.
 * Type guard: narrows to `CanvasTemplateType` (the mintable set equals the
 * canonical canvas-template enum), so `mintCanvasFromStudioStore` passes a
 * validated `template_type` by construction.
 */
export function isMintableCanvasType(type: string): type is CanvasTemplateType {
  return Object.prototype.hasOwnProperty.call(CANVAS_TEMPLATE_FIELDS, type);
}

export function getCanvasTypeFields(type: string): CanvasTypeFields | null {
  return isMintableCanvasType(type) ? CANVAS_TEMPLATE_FIELDS[type] : null;
}

/**
 * German display name for a canvas template. Falls back to the raw type so an
 * unknown value stays visible rather than rendering as an empty chip.
 */
export function getSharepicVariantLabel(canvasType: string): string {
  return isMintableCanvasType(canvasType) ? CANVAS_TEMPLATE_FIELDS[canvasType].label : canvasType;
}

/**
 * Generator sharepic type → base (de-DE) canvas template type.
 *
 * Keys are the `type` values `generateSharepicForChat` accepts, which are NOT
 * canvas template types: `zitat`/`zitat_pure` both produce the pure quote
 * layout.
 */
export const SHAREPIC_GEN_TO_CANVAS_TYPE: Record<string, CanvasTemplateType> = {
  dreizeilen: 'dreizeilen',
  zitat: 'zitat-pure',
  zitat_pure: 'zitat-pure',
  info: 'info',
};

/**
 * de-AT overrides: base canvas type → Austrian variant.
 *
 * Der Slogan landet auf dem Overlay-Sujet, nicht auf der reinen Fläche: es ist
 * das einzige AT-Template mit Foto und damit das einzige, das das Stockbild
 * verwertet, das der Generator ohnehin schon auswählt. Ohne es sähen alle drei
 * Vorschläge gleich aus — drei flächige Grün-Panels nebeneinander.
 */
export const AT_CANVAS_TYPE_OVERRIDES: Partial<Record<CanvasTemplateType, CanvasTemplateType>> = {
  dreizeilen: 'dreizeilen-overlay-at',
  'zitat-pure': 'zitat-pure-at',
  zitat: 'zitat-at',
  info: 'info-at',
};

/**
 * Canvas template type → the generation type `generateSharepicForChat` takes.
 *
 * Written out rather than derived by inverting the two maps above: the
 * inversion is not a clean one (`zitat`/`zitat_pure` collapse onto one canvas
 * type, and the AT variants have to be folded back onto their base), so the
 * derivation was longer and harder to check than the table. `canvasTemplateFields`
 * parity tests assert this map agrees with the two above.
 */
export const CANVAS_TYPE_TO_GEN: Record<string, string> = {
  'zitat-pure': 'zitat_pure',
  zitat: 'zitat_pure',
  dreizeilen: 'dreizeilen',
  info: 'info',
  // Österreich (de-AT) variants map back to the same generation types; the
  // result is re-localized to the `-at` canvasType via `toVariant(userLocale)`.
  'zitat-pure-at': 'zitat_pure',
  'zitat-at': 'zitat_pure',
  'dreizeilen-overlay-at': 'dreizeilen',
  'info-at': 'info',
};

/** Stock images the generator picks are served through the API image proxy. */
export const STOCK_IMAGE_URL_PREFIX = '/api/image-picker/stock-image/';

/**
 * The subset of a generated sharepic the mint path reads. The generator returns
 * more (alt text, the raw prompt), but only these become `initial_state`.
 */
export interface SharepicGeneratedContent {
  mainSlogan?: { line1?: string; line2?: string; line3?: string; subline?: string };
  quote?: string;
  name?: string;
  header?: string;
  subheader?: string;
  body?: string;
  /**
   * Österreich-Info: eigene Felder statt header/subheader/body. `infoText`
   * heisst nicht `text`, weil `text` bei jedem Typ die Zusammenfassung aller
   * Zeilen trägt.
   */
  introline?: string;
  infoText?: string;
  accent?: string;
  selectedImage?: string;
}

/**
 * Build the `initialProps` for a freshly generated variant.
 *
 * Field-for-field identical to the API's former `buildInitialPropsForType`,
 * including the fallback chains (`body ?? subheader`, AT's `line2 → accent`)
 * and the conditional image key — those are load-bearing, not tidy-up targets.
 */
export function buildVariantInitialProps(
  canvasType: string,
  sharepic: SharepicGeneratedContent
): Record<string, unknown> {
  const stockImage = sharepic.selectedImage
    ? { currentImageSrc: `${STOCK_IMAGE_URL_PREFIX}${encodeURIComponent(sharepic.selectedImage)}` }
    : {};

  switch (canvasType) {
    case 'dreizeilen': {
      const slogan = sharepic.mainSlogan ?? {};
      return {
        line1: slogan.line1 ?? '',
        line2: slogan.line2 ?? '',
        line3: slogan.line3 ?? '',
        // Carry the AI-selected stock background so the frontend canvas renders
        // it. `hasBackgroundImage` is derived from `currentImageSrc` in the
        // dreizeilen config's createInitialState — passing this key alone shows
        // the layer.
        ...stockImage,
      };
    }
    case 'zitat-pure':
    case 'zitat':
    case 'zitat-pure-at':
    case 'zitat-at': {
      return {
        quote: sharepic.quote ?? '',
        name: sharepic.name ?? '',
      };
    }
    case 'info': {
      return {
        header: sharepic.header ?? '',
        body: sharepic.body ?? sharepic.subheader ?? '',
      };
    }
    // AT-Info: Introline, Infotext und die gelbe Schlusszeile. Der Prompt
    // liefert die Felder direkt so — anders als das deutsche Info-Sujet mit
    // header/subheader/body.
    case 'info-at': {
      return {
        introline: sharepic.introline ?? '',
        text: sharepic.infoText ?? '',
        accent: sharepic.accent ?? '',
      };
    }
    // AT dreizeilen: line1 + accent (gelbe Mittelzeile) + line3, mit Foto
    // hinter der Farbfläche. Die Subline kommt aus dem AT-Prompt und darf
    // leer sein; das Layout schliesst die Lücke dann selbst.
    case 'dreizeilen-overlay-at': {
      const slogan = sharepic.mainSlogan ?? {};
      return {
        line1: slogan.line1 ?? '',
        accent: slogan.line2 ?? '',
        line3: slogan.line3 ?? '',
        subline: slogan.subline ?? '',
        ...stockImage,
      };
    }
    default:
      return {};
  }
}
