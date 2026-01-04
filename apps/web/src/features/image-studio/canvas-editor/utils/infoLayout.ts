/**
 * Layout constants for Info Sharepic Canvas
 * Mirrors backend: apps/api/routes/sharepic/sharepic_canvas/info_canvas.ts
 *
 * Info sharepic has:
 * - Fixed background image (Info_bg_tanne.png or Info_bg_sand.png)
 * - Header text at top
 * - Arrow icon as separator
 * - Body text with first sentence bold
 */

export const INFO_CONFIG = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  margin: {
    horizontal: 50,
    headerStartY: 190,
  },
  header: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal',
    fontSize: 89,
    minFontSize: 50,
    maxFontSize: 120,
    lineHeightRatio: 1.2,
    bottomSpacing: 40,
    color: '#ffffff',
    x: 50,
    maxWidth: 980, // 1080 - 50 - 50
  },
  arrow: {
    size: 60,
    x: 50,
    rightPadding: 15,
    src: '/arrow_right.svg',
  },
  body: {
    leftMargin: 125, // 50 + 60 + 15
    rightMargin: 50,
    maxWidth: 905, // 1080 - 125 - 50
    firstSentenceFont: 'PTSans-Bold',
    remainingFont: 'PTSans-Regular',
    fontSize: 40,
    minFontSize: 30,
    maxFontSize: 60,
    lineHeightRatio: 1.4,
    color: '#ffffff',
  },
  backgrounds: {
    tanne: '/Info_bg_tanne.png',
    sand: '/Info_bg_sand.png',
  },
  colors: {
    tanne: '#005538',
    klee: '#008939',
    grashalm: '#8ABD24',
    sand: '#F5F1E9',
    himmel: '#009EE3',
  },
} as const;

export type InfoLayoutConfig = typeof INFO_CONFIG;

/**
 * Calculate layout positions for Info sharepic
 */
export function calculateInfoLayout(
  headerFontSize: number = INFO_CONFIG.header.fontSize,
  bodyFontSize: number = INFO_CONFIG.body.fontSize
) {
  const headerLineHeight = headerFontSize * INFO_CONFIG.header.lineHeightRatio;
  const bodyLineHeight = bodyFontSize * INFO_CONFIG.body.lineHeightRatio;

  return {
    canvas: INFO_CONFIG.canvas,
    header: {
      x: INFO_CONFIG.header.x,
      y: INFO_CONFIG.margin.headerStartY,
      maxWidth: INFO_CONFIG.header.maxWidth,
      fontSize: headerFontSize,
      lineHeight: headerLineHeight,
      fontFamily: INFO_CONFIG.header.fontFamily,
      color: INFO_CONFIG.header.color,
    },
    arrow: {
      x: INFO_CONFIG.arrow.x,
      size: INFO_CONFIG.arrow.size,
      // Y position is calculated dynamically based on header height
    },
    body: {
      x: INFO_CONFIG.body.leftMargin,
      maxWidth: INFO_CONFIG.body.maxWidth,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      firstFont: INFO_CONFIG.body.firstSentenceFont,
      regularFont: INFO_CONFIG.body.remainingFont,
      color: INFO_CONFIG.body.color,
    },
  };
}

/**
 * Parse body text into first sentence and remaining text
 */
export function parseBodyText(body: string): { firstSentence: string; remaining: string } {
  // Split on sentence ending followed by capital letter
  const match = body.match(/^([^.!?]*[.!?])(?:\s+)(.+)$/s);
  if (match) {
    return {
      firstSentence: match[1].trim(),
      remaining: match[2].trim(),
    };
  }
  // If no match, treat entire body as first sentence
  return {
    firstSentence: body.trim(),
    remaining: '',
  };
}
