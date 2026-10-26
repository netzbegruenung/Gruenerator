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
  /** A topic icon on its circle. */
  badge: ByGround<{ fill: string; ink: string }>;
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
}

/**
 * A value per kind of ground: light colours, dark colours and photos, and
 * grass green, which a brand may set with dark ink. `grass` falls back to
 * `dark`.
 */
export interface ByGround<T> {
  light: T;
  dark: T;
  grass?: T;
}

/** The value for a slide's ground; `onLight` and `onGrass` never hold together. */
export function onGround<T>(value: ByGround<T>, ground: { onLight: boolean; onGrass: boolean }): T {
  if (ground.onLight) return value.light;
  return ground.onGrass ? (value.grass ?? value.dark) : value.dark;
}
