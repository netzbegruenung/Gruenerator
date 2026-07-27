import { StyleSheet, useColorScheme, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Mobile port of the web Studio surface's gradient — the `canvas` entry in
 * apps/web/src/config/toolTheme.ts, which /studio applies via `getToolGradient`:
 * a pale violet radial fading to white (light) / near-black (dark). Same geometry
 * as the Wissen tab's {@link NotebookGradientBackground} so the two tabs read as
 * one family. Decorative, non-interactive, behind content.
 */
export function StudioGradientBackground() {
  const isDark = useColorScheme() === 'dark';

  const stops = isDark
    ? [
        { offset: '0', color: '#191622' },
        { offset: '0.55', color: '#110F17' },
        { offset: '1', color: '#0B0A0F' },
      ]
    : [
        { offset: '0', color: '#F3F2F9' },
        { offset: '0.55', color: '#F9F8FC' },
        { offset: '1', color: '#FFFFFF' },
      ];

  return (
    <View pointerEvents="none" style={styles.container}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="studioBg" cx="50%" cy="50%" rx="55%" ry="45%">
            {stops.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity="1" />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#studioBg)" />
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
