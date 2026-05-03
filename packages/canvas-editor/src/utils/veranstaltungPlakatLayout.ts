/**
 * Layout constants for Veranstaltung Plakat Canvas
 * Adapted from VERANSTALTUNG_CONFIG (sharepic, 1080×1350) for plakat aspect (~0.707).
 *
 * Reference space is 1080×1528. GenericCanvas scales the Konva stage to the
 * actual plakat-a3 (3508×4961) or plakat-a2 (4961×7016) format dims at runtime,
 * so coordinates here stay in the same readable scale as the sharepic config.
 *
 * Same vertical regions as sharepic (photo on top 40%, green section below,
 * circle date badge on the seam, location footer at bottom) — just stretched
 * to the taller plakat aspect.
 */

const CANVAS_HEIGHT = 1528; // 1080 / 0.707 — matches plakat aspect

export const VERANSTALTUNG_PLAKAT_CONFIG = {
  canvas: {
    width: 1080,
    height: CANVAS_HEIGHT,
  },
  photo: {
    heightRatio: 0.4,
    height: 611, // 1528 * 0.4
  },
  greenSection: {
    y: 611,
    height: 917, // 1528 - 611
    color: '#005538', // TANNE
  },
  text: {
    leftMargin: 55,
    maxWidth: 620,
    color: '#ffffff',
  },
  eventTitle: {
    startY: 671, // photo height (611) + 60
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
    centerX: 880,
    centerY: 945, // photo height (611) + 334 — same offset from photo seam as sharepic
    rotation: -10,
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
    y: 1408, // canvas height (1528) - 120
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

export type VeranstaltungPlakatLayoutConfig = typeof VERANSTALTUNG_PLAKAT_CONFIG;

export function calculateVeranstaltungPlakatLayout(
  eventTitleFontSize: number = VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.fontSize,
  descriptionFontSize: number = VERANSTALTUNG_PLAKAT_CONFIG.description.fontSize
) {
  const titleLineHeight =
    eventTitleFontSize * VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.lineHeightRatio;
  const descriptionLineHeight =
    descriptionFontSize * VERANSTALTUNG_PLAKAT_CONFIG.description.lineHeightRatio;

  return {
    canvas: VERANSTALTUNG_PLAKAT_CONFIG.canvas,
    photo: {
      y: 0,
      height: VERANSTALTUNG_PLAKAT_CONFIG.photo.height,
      width: VERANSTALTUNG_PLAKAT_CONFIG.canvas.width,
    },
    greenSection: {
      y: VERANSTALTUNG_PLAKAT_CONFIG.greenSection.y,
      height: VERANSTALTUNG_PLAKAT_CONFIG.greenSection.height,
      width: VERANSTALTUNG_PLAKAT_CONFIG.canvas.width,
      color: VERANSTALTUNG_PLAKAT_CONFIG.greenSection.color,
    },
    eventTitle: {
      x: VERANSTALTUNG_PLAKAT_CONFIG.text.leftMargin,
      y: VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.startY,
      maxWidth: VERANSTALTUNG_PLAKAT_CONFIG.text.maxWidth,
      fontSize: eventTitleFontSize,
      lineHeight: titleLineHeight,
      fontFamily: VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.fontFamily,
      fontStyle: VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.fontStyle,
      color: VERANSTALTUNG_PLAKAT_CONFIG.text.color,
    },
    description: {
      x: VERANSTALTUNG_PLAKAT_CONFIG.text.leftMargin,
      maxWidth: VERANSTALTUNG_PLAKAT_CONFIG.text.maxWidth,
      fontSize: descriptionFontSize,
      lineHeight: descriptionLineHeight,
      fontFamily: VERANSTALTUNG_PLAKAT_CONFIG.description.fontFamily,
      fontStyle: VERANSTALTUNG_PLAKAT_CONFIG.description.fontStyle,
      color: VERANSTALTUNG_PLAKAT_CONFIG.text.color,
      gapFromTitle: VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.gapBelow,
    },
    circle: {
      x: VERANSTALTUNG_PLAKAT_CONFIG.circle.centerX,
      y: VERANSTALTUNG_PLAKAT_CONFIG.circle.centerY,
      radius: VERANSTALTUNG_PLAKAT_CONFIG.circle.radius,
      rotation: VERANSTALTUNG_PLAKAT_CONFIG.circle.rotation,
      backgroundColor: VERANSTALTUNG_PLAKAT_CONFIG.circle.backgroundColor,
      textColor: VERANSTALTUNG_PLAKAT_CONFIG.circle.textColor,
    },
    footer: {
      x: VERANSTALTUNG_PLAKAT_CONFIG.text.leftMargin,
      y: VERANSTALTUNG_PLAKAT_CONFIG.footer.y,
    },
  };
}
