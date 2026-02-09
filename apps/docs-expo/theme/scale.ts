import { Dimensions, PixelRatio } from 'react-native';

const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

const getScreenDimensions = () => Dimensions.get('window');

export const scale = (size: number): number => {
  const { width } = getScreenDimensions();
  return Math.round((width / BASE_WIDTH) * size);
};

export const verticalScale = (size: number): number => {
  const { height } = getScreenDimensions();
  return Math.round((height / BASE_HEIGHT) * size);
};

export const moderateScale = (size: number, factor: number = 0.5): number => {
  return Math.round(size + (scale(size) - size) * factor);
};

export const fontScale = (size: number): number => {
  return Math.round(PixelRatio.getFontScale() * moderateScale(size, 0.3));
};

export const responsiveSpacing = {
  xxsmall: scale(4),
  xsmall: scale(8),
  small: scale(12),
  medium: scale(16),
  large: scale(24),
  xlarge: scale(32),
  xxlarge: scale(48),
} as const;

export const isTablet = (): boolean => getScreenDimensions().width >= 768;

export const tabletScale = (phoneSize: number, tabletSize: number): number => {
  return isTablet() ? tabletSize : phoneSize;
};
