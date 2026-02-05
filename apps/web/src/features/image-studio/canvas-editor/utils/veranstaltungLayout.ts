/**
 * Layout constants for Veranstaltung (Event) Sharepic Canvas
 * Mirrors backend: apps/api/routes/sharepic/sharepic_canvas/veranstaltung_canvas.ts
 *
 * Veranstaltung sharepic has:
 * - Photo section at top (40% of height)
 * - Green (tanne) section below (60% of height)
 * - Event title and description in green section
 * - Rotated circle with date/time/weekday overlapping photo and green
 * - Location footer at bottom
 */

export const VERANSTALTUNG_CONFIG = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  photo: {
    heightRatio: 0.4,
    height: 540, // 1350 * 0.4
  },
  greenSection: {
    y: 540,
    height: 810, // 1350 - 540
    color: '#005538', // TANNE
  },
  text: {
    leftMargin: 55,
    maxWidth: 620,
    color: '#ffffff',
  },
  eventTitle: {
    startY: 600, // photo height + 60
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal',
    fontSize: 94,
    minFontSize: 66,
    maxFontSize: 122,
    lineHeightRatio: 1.08,
    gapBelow: 26,
  },
  description: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal',
    fontSize: 62,
    minFontSize: 40,
    maxFontSize: 80,
    lineHeightRatio: 1.17,
  },
  circle: {
    radius: 200,
    // Center X: 1080 - 200 + 50 = 930 (but backend uses 1230 which extends past canvas)
    centerX: 880, // Adjusted to be visible on canvas
    centerY: 874, // photo height (540) + 334
    rotation: -10, // degrees
    backgroundColor: '#0BA1DD', // HIMMEL
    textColor: '#ffffff',
    lineHeight: 65,
  },
  circleText: {
    weekday: {
      yOffset: -65,
      fontFamily: 'PTSans-Bold',
      fontSize: 57,
      minFontSize: 40,
      maxFontSize: 74,
    },
    date: {
      yOffset: 5,
      fontFamily: 'PTSans-Regular',
      fontSize: 55,
      minFontSize: 39,
      maxFontSize: 72,
    },
    time: {
      yOffset: 80,
      fontFamily: 'PTSans-Bold',
      fontSize: 55,
      minFontSize: 39,
      maxFontSize: 72,
    },
  },
  footer: {
    y: 1230, // canvas height - 120
    lineHeightRatio: 1.2,
  },
  location: {
    fontFamily: 'PTSans-Regular',
    fontSize: 42,
    minFontSize: 29,
    maxFontSize: 55,
  },
  address: {
    fontFamily: 'PTSans-Regular',
    fontSize: 42,
    minFontSize: 29,
    maxFontSize: 55,
  },
} as const;

export type VeranstaltungLayoutConfig = typeof VERANSTALTUNG_CONFIG;

/**
 * Calculate layout positions for Veranstaltung sharepic
 */
export function calculateVeranstaltungLayout(
  eventTitleFontSize: number = VERANSTALTUNG_CONFIG.eventTitle.fontSize,
  descriptionFontSize: number = VERANSTALTUNG_CONFIG.description.fontSize
) {
  const titleLineHeight = eventTitleFontSize * VERANSTALTUNG_CONFIG.eventTitle.lineHeightRatio;
  const descriptionLineHeight =
    descriptionFontSize * VERANSTALTUNG_CONFIG.description.lineHeightRatio;

  return {
    canvas: VERANSTALTUNG_CONFIG.canvas,
    photo: {
      y: 0,
      height: VERANSTALTUNG_CONFIG.photo.height,
      width: VERANSTALTUNG_CONFIG.canvas.width,
    },
    greenSection: {
      y: VERANSTALTUNG_CONFIG.greenSection.y,
      height: VERANSTALTUNG_CONFIG.greenSection.height,
      width: VERANSTALTUNG_CONFIG.canvas.width,
      color: VERANSTALTUNG_CONFIG.greenSection.color,
    },
    eventTitle: {
      x: VERANSTALTUNG_CONFIG.text.leftMargin,
      y: VERANSTALTUNG_CONFIG.eventTitle.startY,
      maxWidth: VERANSTALTUNG_CONFIG.text.maxWidth,
      fontSize: eventTitleFontSize,
      lineHeight: titleLineHeight,
      fontFamily: VERANSTALTUNG_CONFIG.eventTitle.fontFamily,
      fontStyle: VERANSTALTUNG_CONFIG.eventTitle.fontStyle,
      color: VERANSTALTUNG_CONFIG.text.color,
    },
    description: {
      x: VERANSTALTUNG_CONFIG.text.leftMargin,
      maxWidth: VERANSTALTUNG_CONFIG.text.maxWidth,
      fontSize: descriptionFontSize,
      lineHeight: descriptionLineHeight,
      fontFamily: VERANSTALTUNG_CONFIG.description.fontFamily,
      fontStyle: VERANSTALTUNG_CONFIG.description.fontStyle,
      color: VERANSTALTUNG_CONFIG.text.color,
      gapFromTitle: VERANSTALTUNG_CONFIG.eventTitle.gapBelow,
    },
    circle: {
      x: VERANSTALTUNG_CONFIG.circle.centerX,
      y: VERANSTALTUNG_CONFIG.circle.centerY,
      radius: VERANSTALTUNG_CONFIG.circle.radius,
      rotation: VERANSTALTUNG_CONFIG.circle.rotation,
      backgroundColor: VERANSTALTUNG_CONFIG.circle.backgroundColor,
      textColor: VERANSTALTUNG_CONFIG.circle.textColor,
    },
    footer: {
      x: VERANSTALTUNG_CONFIG.text.leftMargin,
      y: VERANSTALTUNG_CONFIG.footer.y,
    },
  };
}

/**
 * Convert degrees to radians for Konva rotation
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
