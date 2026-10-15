import { StyleSheet, View, useColorScheme } from 'react-native';

import { colors } from '../../theme';

/**
 * A plain near-white page instead of the app's green-tinted gradient — for
 * screens whose own accent (Projekte blue, Grüneratoren cards) carries the
 * colour. Pass it as `ScreenScaffold`'s `backdrop`.
 */
export function NeutralBackdrop() {
  const dark = useColorScheme() === 'dark';
  return (
    <View
      pointerEvents="none"
      style={[styles.fill, { backgroundColor: dark ? colors.grey[950] : colors.grey[50] }]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
