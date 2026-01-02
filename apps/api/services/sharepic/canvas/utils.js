import { COLORS } from './config.js';

function isValidHexColor(color) {
  return /^#[0-9A-F]{6}$/i.test(color);
}

function getDefaultColor(type, index) {
  if (type === 'background') {
    return index === 0 ? COLORS.TANNE : COLORS.SAND;
  } else {
    return index === 0 ? COLORS.SAND : COLORS.TANNE;
  }
}

export { isValidHexColor, getDefaultColor };