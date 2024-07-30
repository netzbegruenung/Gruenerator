const { params } = require('./config');
const { isValidHexColor } = require('./utils');

function validateParams(inputParams) {
  return {
    balkenGruppenOffset: inputParams.balkenGruppenOffset?.map((offset, index) => 
      Math.max(params.MIN_BALKEN_GRUPPEN_OFFSET, Math.min(params.MAX_BALKEN_GRUPPEN_OFFSET, offset ?? params.DEFAULT_BALKEN_GRUPPEN_OFFSET[index]))) 
      ?? params.DEFAULT_BALKEN_GRUPPEN_OFFSET,
    fontSize: Math.max(params.MIN_FONT_SIZE, Math.min(params.MAX_FONT_SIZE, inputParams.fontSize ?? params.DEFAULT_FONT_SIZE)),
    colors: Array.isArray(inputParams.colors) && inputParams.colors.length === 3
      ? inputParams.colors.map((color, index) => ({
          background: isValidHexColor(color.background) ? color.background : params.DEFAULT_COLORS[index].background,
          text: isValidHexColor(color.text) ? color.text : params.DEFAULT_COLORS[index].text
        }))
      : params.DEFAULT_COLORS,
    balkenOffset: inputParams.balkenOffset?.map((offset, index) => 
      Math.max(params.MIN_BALKEN_OFFSET, Math.min(params.MAX_BALKEN_OFFSET, offset ?? params.DEFAULT_BALKEN_OFFSET[index]))) 
      ?? params.DEFAULT_BALKEN_OFFSET,
    sunflowerPosition: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(inputParams.sunflowerPosition)
      ? inputParams.sunflowerPosition
      : params.DEFAULT_SUNFLOWER_POSITION,
    sunflowerOffset: inputParams.sunflowerOffset?.map((offset, index) => 
      Math.max(params.MIN_SUNFLOWER_OFFSET, Math.min(params.MAX_SUNFLOWER_OFFSET, offset ?? params.DEFAULT_SUNFLOWER_OFFSET[index]))) 
      ?? params.DEFAULT_SUNFLOWER_OFFSET,
    text: Array.isArray(inputParams.text) && inputParams.text.length === 3
      ? inputParams.text
      : ['', '', ''],

    // Übernahme der restlichen Parameter aus config.js
    canvasSize: inputParams.canvasSize ?? params.CANVAS_SIZE,
    balkenHeightFactor: inputParams.balkenHeightFactor ?? params.BALKEN_HEIGHT_FACTOR,
    textPaddingFactor: inputParams.textPaddingFactor ?? params.TEXT_PADDING_FACTOR,
    sunflowerSizeFactor: inputParams.sunflowerSizeFactor ?? params.SUNFLOWER_SIZE_FACTOR,
    sunflowerOverlapFactor: inputParams.sunflowerOverlapFactor ?? params.SUNFLOWER_OVERLAP_FACTOR
  };
}

module.exports = {
  validateParams
};
