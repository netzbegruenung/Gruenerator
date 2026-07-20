import { PRESENTATION_DEFAULT_ACCENT, type Slide } from '@gruenerator/contracts';

/**
 * Slide background + text-tone logic ported from the web SlideSurface
 * (defaultBg / resolveBackground / isDarkColor). RN can't render CSS gradients
 * (no expo-linear-gradient dep) — a `linear-gradient(...)` background falls back
 * to the accent solid with light text. Image/data-URL backgrounds render via an
 * absolute-fill <Image>. Everything else is a solid colour.
 */
const SAND = '#f5f1e9';
const WHITE = '#ffffff';

export const SLIDE_W = 960;
export const SLIDE_H = 540;

function defaultBg(layout: Slide['layout'], variant: number, accent: string): string {
  if (layout === 'title') return [accent, WHITE, SAND][variant] ?? accent;
  if (layout === 'quote') return [accent, SAND][variant] ?? accent;
  return WHITE;
}

function isDarkColor(c: string): boolean {
  const hex = c.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return /^#(00|31|0c|1b)/i.test(c);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export interface ResolvedSlideBackground {
  /** Solid fill for the slide surface. */
  backgroundColor: string;
  /** When set, an absolute-fill cover image behind the content. */
  imageUri?: string;
  /** Text should read as light (white) on this background. */
  dark: boolean;
}

export function resolveSlideBackground(
  slide: Slide,
  accentInput?: string | null
): ResolvedSlideBackground {
  const accent = accentInput?.trim() || PRESENTATION_DEFAULT_ACCENT;
  const bg = slide.background?.trim() || defaultBg(slide.layout, slide.variant ?? 0, accent);

  if (/^(https?:|data:|\/)/.test(bg)) {
    return { backgroundColor: '#000000', imageUri: bg, dark: true };
  }
  if (/gradient\(/.test(bg)) {
    return { backgroundColor: accent, dark: true };
  }
  return { backgroundColor: bg, dark: isDarkColor(bg) };
}

export function slideAccent(accentInput?: string | null): string {
  return accentInput?.trim() || PRESENTATION_DEFAULT_ACCENT;
}
