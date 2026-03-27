import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme, type Theme } from '../theme/colors';

export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}
