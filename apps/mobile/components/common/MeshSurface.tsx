import { memo } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { MeshGradient } from './MeshGradient';

import type { MeshPreset } from '../../theme/chatBackgrounds';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * How much of a mesh survives in dark mode.
 *
 * The palettes are light-mode ones; at full alpha over a near-black page they
 * turn into grey smudges. Faint, they still tint the corners, which is what the
 * compositions are for.
 */
export const MESH_DARK_STRENGTH = 0.12;

/**
 * A whole screen painted with a mesh: dark mode handled, optionally riding up
 * with the keyboard.
 *
 * `MeshGradient` paints; this one decides where and how strongly. Which mesh is
 * the caller's business — the chat start reads the person's setting, the drawer
 * and the conversation each wear a fixed one from `theme/chatBackgrounds`. It
 * takes the mesh itself rather than a preset key so there is no "either this
 * prop or that one" and no null to handle: a caller that has a mesh passes it,
 * a caller that has to look one up does the lookup where the answer can be
 * missing.
 */
export const MeshSurface = memo(function MeshSurface({
  mesh,
  id,
  /** Rides up with the keyboard, so the light stays under the composer. */
  followsKeyboard = false,
  /**
   * Where the mesh is laid. Defaults to the whole surface; a bottom-anchored
   * box with a height turns it into a band, and the mesh's fractions are then
   * of that box rather than of the screen.
   */
  style,
}: {
  mesh: MeshPreset;
  id: string;
  followsKeyboard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDark = useColorScheme() === 'dark';

  // Negative while the keyboard is up — that is the sign convention of
  // `useReanimatedKeyboardAnimation`, meant to be applied as a translateY
  // directly.
  const keyboard = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: followsKeyboard ? keyboard.height.value : 0 }],
  }));

  const gradient = (
    <MeshGradient
      mesh={mesh}
      id={id}
      strength={isDark ? MESH_DARK_STRENGTH : 1}
      // Dark mode keeps the page's own near-black instead of the mesh's warm
      // ground; the clouds are only a tint over it there.
      withBase={!isDark}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );

  // A wrapper rather than merging `style` into the gradient's own: the gradient
  // is `position: absolute` with all four edges pinned, and RN ignores a height
  // when both `top` and `bottom` are set. Nesting sidesteps that instead of
  // relying on a later style unsetting an earlier one.
  const placed = style ? (
    <View style={style} pointerEvents="none">
      {gradient}
    </View>
  ) : (
    gradient
  );

  if (!followsKeyboard) return placed;

  // Driven on the UI thread, frame for frame with the keyboard, so it tracks the
  // composer exactly. A `keyboardDidShow` listener plus a timed animation would
  // be two guesses — when it starts and how long it takes — and any mismatch
  // shows as the background sliding out from under the composer.
  //
  // Nothing has to fill the strip the lift vacates at the bottom: it is exactly
  // the keyboard's own height, so the keyboard is standing on it.
  return (
    <Animated.View style={[StyleSheet.absoluteFill, lift]} pointerEvents="none">
      {placed}
    </Animated.View>
  );
});
