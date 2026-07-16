import { StyleSheet, useColorScheme, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Mobile port of the web notebook signature gradient `NOTEBOOK_MAGENTA_BG`
 * (apps/web/src/features/notebook/notebookTheme.ts): a soft pink radial (light) /
 * deep wine-red radial (dark), centered. Opaque full-bleed background for the Wissen
 * tab. Decorative, non-interactive, behind content.
 */
export function NotebookGradientBackground() {
  const isDark = useColorScheme() === 'dark';

  const stops = isDark
    ? [
        { offset: '0', color: '#4A1626' },
        { offset: '0.55', color: '#301019' },
        { offset: '1', color: '#1A0810' },
      ]
    : [
        { offset: '0', color: '#F3CEE1' },
        { offset: '0.55', color: '#F9E4F0' },
        { offset: '1', color: '#FDF5FA' },
      ];

  return (
    <View pointerEvents="none" style={styles.container}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="notebookBg" cx="50%" cy="50%" rx="55%" ry="45%">
            {stops.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity="1" />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#notebookBg)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
});
