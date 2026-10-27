import { brandDefault } from '@ggraphic/core';
import { type AnyCanvasConfig } from '@gruenerator/canvas-editor';

// The stage takes the size of its format (the default one here, 1080 × 1350)
// and scales the template's own space onto it per axis, so the two match.
const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 96;
const HEADLINE_SIZE = 96;

interface DemoState extends Record<string, unknown> {
  headline: string;
}

/**
 * The smallest template the editor accepts: one solid ground and one headline,
 * coloured and set from the neutral brand pack. No sidebar tabs or sections —
 * StandaloneCanvas draws the canvas only.
 */
export const demoTemplate: AnyCanvasConfig = {
  id: 'ggraphic-demo',
  canvas: { width: WIDTH, height: HEIGHT },
  tabs: [],
  sections: {},
  elements: [
    {
      id: 'ground',
      type: 'background',
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT,
      color: brandDefault.defaultBackground,
      order: 0,
    },
    {
      id: 'headline-text',
      type: 'text',
      textKey: 'headline',
      x: MARGIN,
      y: HEIGHT / 2 - HEADLINE_SIZE,
      width: WIDTH - 2 * MARGIN,
      fontSize: HEADLINE_SIZE,
      // The pack ships no font files yet; the host provides the family.
      fontFamily: `${brandDefault.fonts.headline}, Arial, sans-serif`,
      fontStyle: 'bold',
      fill: brandDefault.colors.textOnDark,
      lineHeight: brandDefault.lineHeightFactor,
      align: 'center',
      editable: true,
      draggable: true,
      order: 1,
    },
  ],
  calculateLayout: () => ({}),
  createInitialState: (props): DemoState => ({
    headline: typeof props['headline'] === 'string' ? props['headline'] : '',
  }),
  createActions: (_getState, setState, saveToHistory) => ({
    setHeadline: (headline: string) => {
      setState({ headline });
      saveToHistory();
    },
  }),
};
