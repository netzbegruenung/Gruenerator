import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { type MeshPreset } from '../../theme/chatBackgrounds';

import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Paints a mesh — soft colour clouds over a flat base — and nothing else.
 *
 * Deliberately without policy: no dark mode, no keyboard, no lookup of which
 * mesh belongs where. That lives in `MeshSurface`, which is what a screen
 * reaches for; this is what the settings swatch reaches for, because a swatch
 * has to show the real colours rather than the dimmed ones a dark page gets.
 *
 * The layer tables and the reasoning for why the translation from CSS is exact
 * rather than approximate live in `theme/chatBackgrounds`. The short version is
 * that `react-native-svg`'s `RadialGradient` takes `rx`/`ry` in bounding-box
 * fractions, which is precisely what a CSS `radial-gradient(120% 80% at …)` is.
 *
 * One `Svg` with stacked full-bleed rects, not a view per cloud: a view would
 * need a real blur to lose its edges, and `expo-blur` blurs what is *behind* a
 * view rather than the view itself.
 *
 * `memo`, and not as a precaution. Every mount site sits inside something that
 * re-renders for its own reasons — the drawer on each thread-list change, the
 * settings sheet on each keystroke in it — and this subtree is a dozen SVG
 * elements whose props never change. Rebuilding it is pure waste. The `mesh`
 * objects are module constants and the ids are literals, so the comparison
 * holds; a caller passing an inline `style` object would break it, which is why
 * the one caller that needs a style keeps it in a `StyleSheet`.
 *
 * Drawing is not the concern: the gradient is static, so it rasterises once and
 * is composited from then on. Even the keyboard lift costs no redraw — that
 * runs as a transform on the UI thread and never re-enters React.
 */
export const MeshGradient = memo(function MeshGradient({
  mesh,
  /**
   * Distinguishes this instance's gradient ids. Required rather than derived,
   * because SVG gradient ids are global to the document: the picker renders
   * several meshes at once, and without distinct ids every swatch would paint
   * whichever mesh mounted last.
   */
  id,
  /** Multiplies every stop's alpha. */
  strength = 1,
  withBase = true,
  style,
  pointerEvents,
}: {
  mesh: MeshPreset;
  id: string;
  strength?: number;
  withBase?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto';
}) {
  return (
    <View style={[styles.fill, style]} pointerEvents={pointerEvents}>
      {withBase && <View style={[StyleSheet.absoluteFill, { backgroundColor: mesh.base }]} />}
      <Svg width="100%" height="100%">
        <Defs>
          {mesh.layers.map((layer, index) => (
            <RadialGradient
              key={index}
              id={`${id}-${index}`}
              cx={layer.cx}
              cy={layer.cy}
              rx={layer.rx}
              ry={layer.ry}
            >
              {layer.stops.map((stop, stopIndex) => (
                <Stop
                  key={stopIndex}
                  offset={stop.offset}
                  stopColor={layer.color}
                  stopOpacity={stop.opacity * strength}
                />
              ))}
            </RadialGradient>
          ))}
        </Defs>
        {mesh.layers.map((layer, index) => (
          <Rect key={index} x="0" y="0" width="100%" height="100%" fill={`url(#${id}-${index})`} />
        ))}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
