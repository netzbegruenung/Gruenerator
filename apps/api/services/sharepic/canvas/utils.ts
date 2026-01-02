import { COLORS } from './config.js';

export function isValidHexColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9A-F]{6}$/i.test(color);
}

export function getDefaultColor(type: 'background' | 'text', index: number): string {
  if (type === 'background') {
    return index === 0 ? COLORS.TANNE : COLORS.SAND;
  } else {
    return index === 0 ? COLORS.SAND : COLORS.TANNE;
  }
}
