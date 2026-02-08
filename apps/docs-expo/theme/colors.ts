export const colors = {
  black: '#000000',
  white: '#ffffff',

  primary: {
    50: '#F0F8F4',
    100: '#D8F0E6',
    200: '#B1E0C9',
    300: '#8AC9B0',
    400: '#6BAA91',
    500: '#52907A',
    600: '#316049',
    700: '#285040',
    800: '#1F3F33',
    900: '#1A332A',
    950: '#123624',
  },

  secondary: {
    50: '#F0F4F3',
    100: '#D5E1DC',
    200: '#BACEC6',
    300: '#A0BBB0',
    400: '#85A899',
    500: '#6A9583',
    600: '#5F8575',
    700: '#445F54',
    800: '#31453C',
    900: '#1E2A25',
    950: '#0B0F0D',
  },

  grey: {
    50: '#f9f9f9',
    100: '#efefef',
    200: '#dcdcdc',
    300: '#bdbdbd',
    400: '#989898',
    500: '#7c7c7c',
    600: '#656565',
    700: '#525252',
    800: '#464646',
    900: '#3d3d3d',
    950: '#262626',
  },

  neutral: {
    500: '#f8f4ec',
    600: '#F5F1E9',
    700: '#e8e0d4',
  },

  semantic: {
    error: '#D32F2F',
    success: '#52907A',
    warning: '#FFA000',
    info: '#316049',
  },

  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },

  success: '#52907A',
  warning: '#FFA000',
  info: '#316049',
  klee: '#52907A',
  eucalyptus: '#5F8575',
  sand: '#F5F1E9',
  tanne: '#005538',
} as const;

export const lightTheme = {
  background: colors.white,
  backgroundAlt: colors.primary[50],
  backgroundSand: colors.neutral[600],
  surface: colors.grey[50],
  text: colors.grey[800],
  textSecondary: colors.grey[600],
  textGreen: colors.primary[600],
  link: colors.primary[600],
  border: 'rgba(0, 0, 0, 0.1)',
  buttonBackground: colors.grey[200],
  buttonText: colors.black,
  card: colors.white,
  cardBorder: colors.grey[200],
} as const;

export const darkTheme = {
  background: colors.grey[950],
  backgroundAlt: colors.grey[900],
  backgroundSand: colors.grey[800],
  surface: colors.grey[900],
  text: colors.grey[100],
  textSecondary: colors.grey[400],
  textGreen: colors.primary[400],
  link: colors.primary[400],
  border: 'rgba(255, 255, 255, 0.1)',
  buttonBackground: colors.grey[800],
  buttonText: colors.white,
  card: colors.grey[900],
  cardBorder: colors.grey[700],
} as const;

export type Theme = typeof lightTheme;
