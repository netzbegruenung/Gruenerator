/**
 * Schriftgrößen der Keyword-Wolke: Rang statt Häufigkeit, damit ein einzelner
 * Ausreißer („trump" mit dem Dreifachen) nicht alle anderen klein drückt.
 * Kurve und Grenzen aus dem Entwurf „Puls" (Claude Design, 06.11.2026).
 */
export interface KeywordStyle {
  /** CSS `font-size`, schrumpft mit der Fensterbreite bis auf 72 %. */
  fontSize: string;
  tone: 'accent' | 'strong' | 'muted';
}

/** Schriftgröße in Pixeln je Rang — die Grundlage für Web (`keywordStyles`) und App. */
export function keywordPixels(
  count: number,
  maxPx: number,
  minPx: number
): { px: number; tone: KeywordStyle['tone'] }[] {
  return Array.from({ length: count }, (_, i) => {
    const f = Math.pow(1 - i / count, 1.6);
    return {
      px: Math.round(minPx + f * (maxPx - minPx)),
      tone: i === 0 ? 'accent' : f > 0.35 ? 'strong' : 'muted',
    };
  });
}

export function keywordStyles(count: number, maxPx: number, minPx: number): KeywordStyle[] {
  return keywordPixels(count, maxPx, minPx).map(({ px, tone }) => {
    const floor = Math.max(14, Math.round(px * 0.72));
    return { fontSize: `clamp(${floor}px, ${(px / 13).toFixed(2)}vw, ${px}px)`, tone };
  });
}

const normalise = (s: string) => s.toLocaleLowerCase('de-DE').replace(/^#/, '');

/**
 * Ob ein X-Trend auch in den Nachrichten steht: eines seiner Wörter ist ein
 * Top-Keyword, oder der Trend steht in einer Schlagzeile über die Grünen.
 * Solche Trends hebt die Karte hervor.
 */
export function trendInTheNews(
  trend: string,
  keywords: ReadonlySet<string>,
  greensTitles: readonly string[]
): boolean {
  const name = normalise(trend);
  if (name.split(/\s+/).some((w) => w.length >= 3 && keywords.has(w))) return true;
  return greensTitles.some((t) => normalise(t).includes(name));
}
