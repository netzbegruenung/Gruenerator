/**
 * Brand themes — per-locale design tokens for sharepic configs.
 *
 * Single source of truth for country-specific brand identity (colours, fonts,
 * logo, quote mark). The identity lives as data in two ggraphic brand packs,
 * GRUENE_DE and GRUENE_AT; BRAND_THEMES is read off them for the readers of
 * getBrandTheme(). A new locale = one pack and one entry in BRAND_THEMES; the
 * config factories and layout constants read tokens from here instead of
 * hardcoding Die-Grünen-Deutschland green.
 *
 * Mirrors the audience pattern in packages/shared/src/agents/audience.ts.
 *
 * de-AT sources: "Grüne CI Workshop 2026" (The Odd) — Dunkelgrün #257639
 * (Hauptfarbe), Hellgrün #56af31, Gelb #FCEC00 (Headline-Hervorhebung),
 * Magenta #E4007C (Störer); Fonts Gotham Narrow (Ultra/Book) + Vollkorn
 * (Betonung/Zitate); Zeilenabstand = Schriftgröße × 0,9; reduziertes
 * Ein-Balken-Logo "G DIE GRÜNEN".
 */

export {
  BRAND_THEMES,
  GRUENE_AT,
  GRUENE_DE,
  HELLGRUEN_GLOW,
  getBrandPack,
  getBrandTheme,
  type BrandLocale,
  type BrandTheme,
  type GrueneBrandId,
} from '@gruenerator/contracts/brand';

/** Read from the registered packs, which apps/web installs from these two. */
export { surfaceGlow } from '@ggraphic/editor/utils/surfaceGlow';
