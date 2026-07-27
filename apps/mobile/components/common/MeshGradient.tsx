import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { MESH_BASE, MESH_LAYERS } from '../../theme/chatBackgrounds';

import type { StyleProp, ViewStyle } from 'react-native';

/**
 * The `mesh` chat background: five soft colour clouds over a warm base.
 *
 * Ported 1:1 from the design document (claude.ai/design, "Grünerator Mobile").
 * The layer table and the reasoning for why the translation from CSS is exact
 * rather than approximate live in `theme/chatBackgrounds` — the short version is
 * that `react-native-svg`'s `RadialGradient` takes `rx`/`ry` in bounding-box
 * fractions, which is precisely what a CSS `radial-gradient(120% 80% at …)` is.
 *
 * One `Svg` with five stacked full-bleed rects, not five nested views: a view
 * per cloud would need a real blur to lose its edges, and `expo-blur` blurs what
 * is *behind* a view rather than the view itself.
 *
 * Its own component so the settings swatch can draw the actual mesh in a circle
 * rather than a stand-in colour. Without that, `mesh` and `Neutral` would be two
 * identical empty rings in the picker — the mesh has no single colour to reduce
 * to, which is the point of it.
 */
export function MeshGradient({
  /** Multiplies every layer's alpha. Dark mode passes a fraction; see below. */
  strength = 1,
  withBase = true,
  style,
}: {
  strength?: number;
  withBase?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.fill, style]}>
      {withBase && <View style={[StyleSheet.absoluteFill, styles.base]} />}
      <Svg width="100%" height="100%">
        <Defs>
          {MESH_LAYERS.map((layer, index) => (
            <RadialGradient
              key={layer.color}
              id={`mesh${index}`}
              cx={layer.cx}
              cy={layer.cy}
              rx={layer.rx}
              ry={layer.ry}
            >
              <Stop offset="0" stopColor={layer.color} stopOpacity={layer.opacity * strength} />
              <Stop offset={layer.end} stopColor={layer.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {MESH_LAYERS.map((layer, index) => (
          <Rect
            key={layer.color}
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#mesh${index})`}
          />
        ))}
      </Svg>
    </View>
  );
}

/**
 * How much of the mesh survives in dark mode.
 *
 * The palette is a light-mode one; at full alpha over a near-black page it turns
 * into five grey smudges. Faint, it still tints the corners, which is what the
 * composition is for.
 */
export const MESH_DARK_STRENGTH = 0.12;

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  base: { backgroundColor: MESH_BASE },
});
