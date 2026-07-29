/**
 * Info AT Layout (Österreich / de-AT)
 *
 * Farbfläche, Logo rechts oben, darunter mittig drei Zonen: eine kleine
 * Introline in Gotham Book, der große Infotext in Gotham Ultra und eine gelbe
 * Vollkorn-Schlusszeile. Alle drei schrumpfen um einen gemeinsamen Faktor, bis
 * der Block in die Satzhöhe passt, und werden dann als Gruppe zentriert.
 *
 * Aus der Guideline zurückgerechnet: Satzmaß ~0,76 der Blattbreite, Infotext
 * ~100 px, Introline ~34 px, Blockmitte leicht unterhalb der Blattmitte.
 *
 * Spiegelbild von apps/api/routes/sharepic/sharepic_canvas/at/info_at_canvas.ts.
 */

import { getBrandTheme } from '../brand/theme';

import { SYSTEM_ASSETS } from './canvasAssets';
import { measureTextWidthWithFont, wrapTextAccurate } from './textUtils';

const AT = getBrandTheme('de-AT');
const LOGO_ASPECT = 1410 / 1239;

export const INFO_AT_CONFIG = {
  canvas: { width: 1080, height: 1350 },
  margin: 160,
  maxWidth: 760,
  /**
   * Der Block sitzt leicht unter der Blattmitte — über ihm steht das Logo,
   * darunter bleibt die Fläche frei.
   */
  groupCenterRatio: 0.55,
  /** Ober- und Untergrenze, die der Block nicht verlassen darf. */
  topBoundary: 330,
  bottomBoundary: 1250,
  introline: {
    fontFamily: AT.fonts.body,
    fontStyle: 'normal' as const,
    fontSize: 52,
    lineHeightRatio: 1.25,
    color: AT.colors.textOnDark,
  },
  text: {
    fontFamily: AT.fonts.headline,
    fontStyle: 'normal' as const,
    fontSize: 118,
    minFontSize: 70,
    /** Kurze Aussagen dürfen die Fläche füllen, statt verloren mittig zu stehen. */
    maxFontSize: 190,
    /** Die AT-CI setzt Fließsatz eng — derselbe Faktor wie beim Dreizeiler. */
    lineHeightRatio: 0.95,
    color: AT.colors.textOnDark,
  },
  accent: {
    fontFamily: AT.fonts.quoteEmphasis,
    fontStyle: 'italic' as const,
    lineHeightRatio: 0.95,
    color: AT.colors.accent,
    /**
     * Vollkorn hat einen größeren Aufsteiger als Gotham Narrow (0,952 em gegen
     * 0,80 em) und sitzt im Zeilenkasten deshalb tiefer. Der Versatz ist genau
     * diese Differenz — ein Faktor der Schriftgröße, damit er beim Skalieren
     * mitläuft. Ein größerer, rein nach Augenmaß gewählter Wert schloss die
     * Lücke im Vollformat, ließ die gelbe Zeile aber bei hochskalierter Schrift
     * in den Text darüber laufen.
     */
    leadShiftRatio: -0.152,
  },
  /** Abstand zwischen Introline und Infotext. */
  introGap: 20,
  logo: {
    src: AT.logo?.src ?? SYSTEM_ASSETS.logoAt.weiss.src,
    width: 150,
    height: Math.round(150 * LOGO_ASPECT),
    margin: 70,
  },
} as const;

export interface InfoAtZoneLayout {
  y: number;
  fontSize: number;
}

export interface InfoAtLayout {
  /** Introline, Infotext, gelbe Schlusszeile — in dieser Reihenfolge. */
  zones: [InfoAtZoneLayout, InfoAtZoneLayout, InfoAtZoneLayout];
  scale: number;
}

const C = INFO_AT_CONFIG;
const MIN_SCALE = C.text.minFontSize / C.text.fontSize;
const MAX_SCALE = C.text.maxFontSize / C.text.fontSize;
const AVAILABLE = C.bottomBoundary - C.topBoundary;

interface Zone {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: 'normal' | 'italic';
  lineHeightRatio: number;
}

function zonesFor(introline: string, text: string, accent: string): Zone[] {
  return [
    {
      text: introline,
      fontSize: C.introline.fontSize,
      fontFamily: C.introline.fontFamily,
      fontStyle: C.introline.fontStyle,
      lineHeightRatio: C.introline.lineHeightRatio,
    },
    {
      text,
      fontSize: C.text.fontSize,
      fontFamily: C.text.fontFamily,
      fontStyle: C.text.fontStyle,
      lineHeightRatio: C.text.lineHeightRatio,
    },
    {
      text: accent,
      fontSize: C.text.fontSize,
      fontFamily: C.accent.fontFamily,
      fontStyle: C.accent.fontStyle,
      lineHeightRatio: C.accent.lineHeightRatio,
    },
  ];
}

/**
 * Breiteste einzelne Wortbreite im Block. Wächst die Schrift darüber hinaus,
 * bricht Konva INNERHALB des Wortes — `wrapTextAccurate` bricht nur an
 * Leerzeichen und meldet die Zeile weiterhin als eine, sodass die berechnete
 * Höhe nicht mehr zu dem passt, was gezeichnet wird.
 */
function longestWordFits(zones: Zone[], scale: number): boolean {
  return zones.every((z) => {
    if (!z.text) return true;
    const fontSize = Math.round(z.fontSize * scale);
    return z.text
      .split(/\s+/)
      .every((w) => measureTextWidthWithFont(w, fontSize, z.fontFamily, z.fontStyle) <= C.maxWidth);
  });
}

function measure(zones: Zone[], scale: number): { heights: number[]; total: number } {
  const heights = zones.map((z) => {
    if (!z.text) return 0;
    const fontSize = Math.round(z.fontSize * scale);
    const lines = wrapTextAccurate(z.text, C.maxWidth, fontSize, z.fontFamily, z.fontStyle).length;
    return lines * fontSize * z.lineHeightRatio;
  });
  // Der Abstand existiert nur, wenn eine Introline gesetzt ist.
  const gap = heights[0]! > 0 ? C.introGap : 0;
  // Der Versatz der Akzent-Zone verkürzt den Block real — sonst zentriert die
  // Gruppe um eine Höhe, die so nie gezeichnet wird.
  const shift = heights[2]! > 0 ? Math.round(C.text.fontSize * scale * C.accent.leadShiftRatio) : 0;
  return { heights, total: heights.reduce((a, b) => a + b, 0) + gap + shift };
}

/**
 * Schrumpft alle drei Zonen um einen gemeinsamen Faktor, bis der Block in die
 * Satzhöhe passt, und zentriert ihn dann als Gruppe. Ein gemeinsamer Faktor
 * statt drei einzelner: sonst verschiebt sich das Größenverhältnis zwischen
 * Introline und Infotext, sobald der Text einmal lang wird.
 */
export function calculateInfoAtLayout(
  introline: string,
  text: string,
  accent: string
): InfoAtLayout {
  const zones = zonesFor(introline, text, accent);
  let scale = 1;
  let m = measure(zones, scale);
  // Kurze Aussagen wachsen, lange weichen. Ohne den Aufwärtsschritt stand ein
  // Dreiwortsatz in derselben Größe wie ein Fünfzeiler und verlor die Fläche.
  while (m.total <= AVAILABLE && scale < MAX_SCALE) {
    const step = scale + 0.04;
    const next = measure(zones, step);
    if (next.total > AVAILABLE || !longestWordFits(zones, step)) break;
    scale = step;
    m = next;
  }
  while (m.total > AVAILABLE && scale > MIN_SCALE) {
    scale = Math.max(MIN_SCALE, scale - 0.04);
    m = measure(zones, scale);
  }

  const centred = Math.round(C.canvas.height * C.groupCenterRatio - m.total / 2);
  let y = Math.max(C.topBoundary, Math.min(centred, C.bottomBoundary - m.total));

  const out: InfoAtZoneLayout[] = [];
  zones.forEach((z, i) => {
    if (i === 1 && m.heights[0]! > 0) y += C.introGap;
    const fontSize = Math.round(z.fontSize * scale);
    const shift = i === 2 ? fontSize * C.accent.leadShiftRatio : 0;
    out.push({ y: Math.round(y + shift), fontSize });
    y += m.heights[i] ?? 0;
  });

  return { zones: out as InfoAtLayout['zones'], scale };
}
