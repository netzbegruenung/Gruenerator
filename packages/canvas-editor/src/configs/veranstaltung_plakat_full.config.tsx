/**
 * Veranstaltung Plakat Canvas Configuration
 *
 * Adapts the sharepic Veranstaltung config (1080×1350) to plakat aspect
 * (1080×1528, ratio ~0.707). Most config wiring (tabs, sections, AI capabilities,
 * actions, state shape) is shared with the sharepic version via spread; the
 * positional pieces — canvas dims, green-section coords, layout calculation,
 * initial circle-badge position — get overridden with the plakat layout.
 *
 * The config keeps the same id-shape contract; configLoader registers
 * 'veranstaltung-plakat' as a separate canvas type so consumers can pick the
 * plakat layout without changing sharepic behavior.
 */

import {
  VERANSTALTUNG_PLAKAT_CONFIG,
  calculateVeranstaltungPlakatLayout,
} from '../utils/veranstaltungPlakatLayout';

import { veranstaltungFullConfig } from './veranstaltung_full.config';

import type { VeranstaltungFullState, VeranstaltungFullActions } from './veranstaltung_full.config';
import type { FullCanvasConfig, LayoutResult } from './types';
import type { CircleBadgeInstance, CircleBadgeTextLine } from '../primitives';

const calculatePlakatLayout = (state: VeranstaltungFullState): LayoutResult => {
  const eventTitleFontSize =
    state.customEventTitleFontSize ?? VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.fontSize;
  const beschreibungFontSize =
    state.customBeschreibungFontSize ?? VERANSTALTUNG_PLAKAT_CONFIG.description.fontSize;
  const layout = calculateVeranstaltungPlakatLayout(eventTitleFontSize, beschreibungFontSize);

  const titleLineHeight =
    eventTitleFontSize * VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.lineHeightRatio;
  const estimatedTitleLines = Math.ceil((state.eventTitle?.length ?? 0) / 20);
  const titleHeight = estimatedTitleLines * titleLineHeight;
  const beschreibungY =
    layout.eventTitle.y + titleHeight + VERANSTALTUNG_PLAKAT_CONFIG.eventTitle.gapBelow;

  return {
    'event-title': {
      x: layout.eventTitle.x,
      y: layout.eventTitle.y,
      width: VERANSTALTUNG_PLAKAT_CONFIG.text.maxWidth,
      fontSize: eventTitleFontSize,
    },
    beschreibung: {
      x: layout.description.x,
      y: beschreibungY,
      width: VERANSTALTUNG_PLAKAT_CONFIG.text.maxWidth,
      fontSize: beschreibungFontSize,
    },
    circle: {
      x: layout.circle.x,
      y: layout.circle.y,
    },
    location: {
      x: layout.footer.x,
      y: layout.footer.y,
    },
  };
};

const createPlakatDateCircleBadge = (
  weekday: string,
  date: string,
  time: string
): CircleBadgeInstance => {
  const circleConfig = VERANSTALTUNG_PLAKAT_CONFIG.circle;
  const circleTextConfig = VERANSTALTUNG_PLAKAT_CONFIG.circleText;
  const textLines: CircleBadgeTextLine[] = [
    {
      text: weekday,
      yOffset: circleTextConfig.weekday.yOffset,
      fontFamily: circleTextConfig.weekday.fontFamily,
      fontSize: circleTextConfig.weekday.fontSize,
      fontWeight: 'bold',
    },
    {
      text: date,
      yOffset: circleTextConfig.date.yOffset,
      fontFamily: circleTextConfig.date.fontFamily,
      fontSize: circleTextConfig.date.fontSize,
      fontWeight: 'normal',
    },
    {
      text: time,
      yOffset: circleTextConfig.time.yOffset,
      fontFamily: circleTextConfig.time.fontFamily,
      fontSize: circleTextConfig.time.fontSize,
      fontWeight: 'bold',
    },
  ];
  return {
    id: 'date-circle',
    x: circleConfig.centerX,
    y: circleConfig.centerY,
    radius: circleConfig.radius,
    backgroundColor: circleConfig.backgroundColor,
    textColor: circleConfig.textColor,
    rotation: circleConfig.rotation,
    scale: 1,
    opacity: 1,
    textLines,
  };
};

// Override the green-section element with plakat coordinates. All other
// elements compute their positions from the layout result, which we already
// override above — so they don't need element-level overrides.
const baseElements = veranstaltungFullConfig.elements;
const plakatElements = baseElements.map((el) =>
  el.id === 'green-section'
    ? {
        ...el,
        y: VERANSTALTUNG_PLAKAT_CONFIG.greenSection.y,
        width: VERANSTALTUNG_PLAKAT_CONFIG.canvas.width,
        height: VERANSTALTUNG_PLAKAT_CONFIG.greenSection.height,
      }
    : el
);

export const veranstaltungPlakatFullConfig: FullCanvasConfig<
  VeranstaltungFullState,
  VeranstaltungFullActions
> = {
  ...veranstaltungFullConfig,
  id: 'veranstaltung-plakat',
  canvas: {
    width: VERANSTALTUNG_PLAKAT_CONFIG.canvas.width,
    height: VERANSTALTUNG_PLAKAT_CONFIG.canvas.height,
  },
  elements: plakatElements,
  calculateLayout: calculatePlakatLayout,
  createInitialState: (props: Record<string, unknown>) => {
    const base = veranstaltungFullConfig.createInitialState(props);
    const weekday = (props.weekday as string | undefined) ?? '';
    const date = (props.date as string | undefined) ?? '';
    const time = (props.time as string | undefined) ?? '';
    return {
      ...base,
      circleBadgeInstances: [createPlakatDateCircleBadge(weekday, date, time)],
    };
  },
};
