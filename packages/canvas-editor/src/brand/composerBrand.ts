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
}
