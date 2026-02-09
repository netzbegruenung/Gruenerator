import { Platform, TextStyle } from 'react-native';

const systemFont = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const typography = {
  h1: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  } as TextStyle,

  h2: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.3,
  } as TextStyle,

  h3: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
  } as TextStyle,

  h4: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
  } as TextStyle,

  body: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  } as TextStyle,

  bodyBold: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,

  bodySmall: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  } as TextStyle,

  label: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  } as TextStyle,

  caption: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,

  button: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,

  buttonSmall: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  } as TextStyle,
} as const;
