import { params } from './config.js';
import { isValidHexColor } from './utils.js';
import type { SharepicInputParams, ValidatedSharepicParams, SunflowerPosition, ColorPair } from './types.js';

const VALID_SUNFLOWER_POSITIONS: SunflowerPosition[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

export function validateParams(inputParams: SharepicInputParams): ValidatedSharepicParams {
  const balkenGruppenOffset: [number, number] = [
    inputParams.balkenGruppenOffset?.[0] !== undefined
      ? Math.max(params.MIN_BALKEN_GRUPPEN_OFFSET, Math.min(params.MAX_BALKEN_GRUPPEN_OFFSET, inputParams.balkenGruppenOffset[0]))
      : params.DEFAULT_BALKEN_GRUPPEN_OFFSET[0],
    inputParams.balkenGruppenOffset?.[1] !== undefined
      ? Math.max(params.MIN_BALKEN_GRUPPEN_OFFSET, Math.min(params.MAX_BALKEN_GRUPPEN_OFFSET, inputParams.balkenGruppenOffset[1]))
      : params.DEFAULT_BALKEN_GRUPPEN_OFFSET[1]
  ];

  const fontSize = Math.max(
    params.MIN_FONT_SIZE,
    Math.min(
      params.MAX_FONT_SIZE,
      parseInt(String(inputParams.fontSize)) || params.DEFAULT_FONT_SIZE
    )
  );

  const colors: [ColorPair, ColorPair, ColorPair] = Array.isArray(inputParams.colors) && inputParams.colors.length === 3
    ? [
        {
          background: isValidHexColor(inputParams.colors[0]?.background) ? inputParams.colors[0].background : params.DEFAULT_COLORS[0].background,
          text: isValidHexColor(inputParams.colors[0]?.text) ? inputParams.colors[0].text : params.DEFAULT_COLORS[0].text
        },
        {
          background: isValidHexColor(inputParams.colors[1]?.background) ? inputParams.colors[1].background : params.DEFAULT_COLORS[1].background,
          text: isValidHexColor(inputParams.colors[1]?.text) ? inputParams.colors[1].text : params.DEFAULT_COLORS[1].text
        },
        {
          background: isValidHexColor(inputParams.colors[2]?.background) ? inputParams.colors[2].background : params.DEFAULT_COLORS[2].background,
          text: isValidHexColor(inputParams.colors[2]?.text) ? inputParams.colors[2].text : params.DEFAULT_COLORS[2].text
        }
      ]
    : [...params.DEFAULT_COLORS];

  const credit = typeof inputParams.credit === 'string'
    ? inputParams.credit.slice(0, params.MAX_CREDIT_LENGTH ?? 50).trim()
    : '';

  const balkenOffset: [number, number, number] = [
    inputParams.balkenOffset?.[0] !== undefined && inputParams.balkenOffset[0] !== null
      ? Math.max(params.MIN_BALKEN_OFFSET, Math.min(params.MAX_BALKEN_OFFSET, inputParams.balkenOffset[0]))
      : params.DEFAULT_BALKEN_OFFSET[0],
    inputParams.balkenOffset?.[1] !== undefined && inputParams.balkenOffset[1] !== null
      ? Math.max(params.MIN_BALKEN_OFFSET, Math.min(params.MAX_BALKEN_OFFSET, inputParams.balkenOffset[1]))
      : params.DEFAULT_BALKEN_OFFSET[1],
    inputParams.balkenOffset?.[2] !== undefined && inputParams.balkenOffset[2] !== null
      ? Math.max(params.MIN_BALKEN_OFFSET, Math.min(params.MAX_BALKEN_OFFSET, inputParams.balkenOffset[2]))
      : params.DEFAULT_BALKEN_OFFSET[2]
  ];

  const sunflowerPosition: SunflowerPosition = VALID_SUNFLOWER_POSITIONS.includes(inputParams.sunflowerPosition as SunflowerPosition)
    ? inputParams.sunflowerPosition as SunflowerPosition
    : params.DEFAULT_SUNFLOWER_POSITION;

  const sunflowerOffset: [number, number] = [
    inputParams.sunflowerOffset?.[0] !== undefined
      ? Math.max(params.MIN_SUNFLOWER_OFFSET, Math.min(params.MAX_SUNFLOWER_OFFSET, inputParams.sunflowerOffset[0]))
      : params.DEFAULT_SUNFLOWER_OFFSET[0],
    inputParams.sunflowerOffset?.[1] !== undefined
      ? Math.max(params.MIN_SUNFLOWER_OFFSET, Math.min(params.MAX_SUNFLOWER_OFFSET, inputParams.sunflowerOffset[1]))
      : params.DEFAULT_SUNFLOWER_OFFSET[1]
  ];

  const text: [string, string, string] = Array.isArray(inputParams.text) && inputParams.text.length === 3
    ? [inputParams.text[0] ?? '', inputParams.text[1] ?? '', inputParams.text[2] ?? '']
    : ['', '', ''];

  return {
    balkenGruppenOffset,
    fontSize,
    colors,
    credit,
    balkenOffset,
    sunflowerPosition,
    sunflowerOffset,
    text,
    canvasSize: inputParams.canvasSize ?? params.CANVAS_SIZE,
    balkenHeightFactor: inputParams.balkenHeightFactor ?? params.BALKEN_HEIGHT_FACTOR,
    textPaddingFactor: inputParams.textPaddingFactor ?? params.TEXT_PADDING_FACTOR,
    sunflowerSizeFactor: inputParams.sunflowerSizeFactor ?? params.SUNFLOWER_SIZE_FACTOR,
    sunflowerOverlapFactor: inputParams.sunflowerOverlapFactor ?? params.SUNFLOWER_OVERLAP_FACTOR
  };
}
