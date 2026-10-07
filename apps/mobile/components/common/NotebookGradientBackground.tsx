import { StyleSheet, useColorScheme, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

type GradientStop = { offset: string; color: string };

/** A surface's own radial: the hue at the centre, paling to the edge. */
const SURFACE_STOPS: Record<'wissen' | 'studio', { light: GradientStop[]; dark: GradientStop[] }> =
  {
    // Port of the web notebook signature gradient `NOTEBOOK_MAGENTA_BG`
    // (apps/web/src/features/notebook/notebookTheme.ts).
    wissen: {
      light: [
        { offset: '0', color: '#F3CEE1' },
        { offset: '0.55', color: '#F9E4F0' },
        { offset: '1', color: '#FDF5FA' },
      ],
      dark: [
        { offset: '0', color: '#4A1626' },
        { offset: '0.55', color: '#301019' },
        { offset: '1', color: '#1A0810' },
      ],
    },
    // The Studio violet of the KI-Bild tile and the Studio FAB, at the same
    // strength as the notebook's magenta.
    studio: {
      light: [
        { offset: '0', color: '#DDD7F0' },
        { offset: '0.55', color: '#ECE9F7' },
        { offset: '1', color: '#F8F7FC' },
      ],
      dark: [
        { offset: '0', color: '#2C2448' },
        { offset: '0.55', color: '#1F1A33' },
        { offset: '1', color: '#110E1C' },
      ],
    },
  };

/**
 * A surface's signature gradient: a soft radial in its hue (light) / a deep
 * one (dark), centered. Opaque full-bleed background, decorative,
 * non-interactive, behind content.
 */
export function SurfaceGradientBackground({ surface }: { surface: 'wissen' | 'studio' }) {
  const isDark = useColorScheme() === 'dark';
  const stops = SURFACE_STOPS[surface][isDark ? 'dark' : 'light'];
  const id = `${surface}Bg`;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="55%" ry="45%">
            {stops.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity="1" />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The Wissen tab's and the notebooks' magenta. */
export function NotebookGradientBackground() {
  return <SurfaceGradientBackground surface="wissen" />;
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
