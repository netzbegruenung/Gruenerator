/**
 * What the sharepic composer sets differently per brand, as data. Each field
 * replaces an `isAt` branch in `composer/`; the pack holds the values, the
 * composer reads `ctx.brand`. The shape moves into @ggraphic/core's BrandPack
 * once the composer engine moves there.
 */
export interface ComposerBrand {
  /** Line height as a share of the font size, per text role. */
  lineHeight: {
    headline: number;
    absatz: number;
    aufruf: number;
  };
  /** Font sizes in px at the 1080 px export, per text role. */
  fontSize: {
    /** The „weiter“ text beside the swipe arrow, before it is fitted. */
    weiter: number;
    /** A paragraph before scaling. */
    absatz: number;
    steckbriefGruss: number;
    /** The name is fitted to its width and never set larger than this. */
    steckbriefName: number;
    /** Trait labels start here and shrink until they fit. */
    steckbriefTrait: number;
  };
  /** Space after a paragraph, as a share of its font size. */
  absatzGap: number;
  /**
   * Roles set in the headline face instead of the body face, and then in that
   * face's own weight, never a synthetic bold. For a brand whose body face has
   * no bold cut.
   */
  headlineFace: {
    absatz: boolean;
    infografikTitel: boolean;
    datum: boolean;
  };
  /** Layouts only some brands have. Off, a spec that asks for one gets the plain form. */
  features: {
    /** `++passage++` as dark text in a box; off, it folds into the accent (`==`). */
    markerBox: boolean;
    /** A slide's `zeilenboxen`: every line on its own box. */
    zeilenboxen: boolean;
    /** A colour slide's `kopfband`: the text above the card on its own band. */
    kopfband: boolean;
    /** A `text` item whose last line is one word shrinks a little to pull it up. */
    widowGuard: boolean;
    /** A comparison's `spalten`: the slide split edge to edge; off, two panels. */
    vergleichSpalten: boolean;
    /** A petition call's `hinweis` as a pill; off, a line of text. */
    hinweisPill: boolean;
  };
  /** Dark text: on light ground, and on grass green where the brand sets it dark. */
  darkText: string;
  /**
   * `==word==` runs, figures and numerals. With `emphasis` the runs are also
   * set in the brand's quote-emphasis face, bold italic.
   */
  accent: { fill: ByGround<string>; emphasis: boolean };
  /** A topic icon on its circle. */
  badge: ByGround<{ fill: string; ink: string }>;
  /** A pill button, and the hint pill under a petition call. */
  button: ByGround<{ fill: string; ink: string }>;
  /** Accent on a white card: figures and list markers. */
  cardAccent: string;
  /** The large pale numeral behind a point. */
  ghostNumeral: { fill: ByGround<string>; opacity: number };
  /** The digit inside a countdown circle. */
  countdownInk: ByGround<string>;
  /**
   * What a hand mark drawn white becomes, and what a green one becomes; a
   * green one on grass green takes `greenOnGrass` when the brand sets one.
   */
  handMarks: { white: string; green: string; greenOnGrass?: string };
  /**
   * The Störer, a tilted circle in the corner opposite the text. `'fit'` grows
   * it with its text as far as the block leaves room, and a centred block
   * keeps the smallest circle's corner free; a fixed size keeps its radius and
   * type and wraps the text to at most three lines.
   */
  stoerer: {
    /** Degrees; Konva turns clockwise, so a negative angle ascends. */
    rotation: number;
    colors: ByGround<{ fill: string; ink: string }>;
    size: 'fit' | { radius: number; fontSize: number };
  };
  /**
   * The footer logo: its asset and opacity per ground, its width in px, its
   * height at that width, and the gap from its bottom edge to the slide's.
   */
  logo: {
    asset: ByGround<{ assetId: string; opacity: number }>;
    size: number;
    height: number;
    bottom: number;
  };
}

/**
 * A value per kind of ground: light colours, dark colours and photos, and
 * grass green, which a brand may set with dark ink. An absent `grass` falls
 * back to `dark`; a set one wins there, `null` included.
 */
export interface ByGround<T> {
  light: T;
  dark: T;
  grass?: T;
}

/** The value for a slide's ground; `onLight` and `onGrass` never hold together. */
export function onGround<T>(value: ByGround<T>, ground: { onLight: boolean; onGrass: boolean }): T {
  if (ground.onLight) return value.light;
  return ground.onGrass && value.grass !== undefined ? value.grass : value.dark;
}
