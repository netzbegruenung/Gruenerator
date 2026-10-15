import { StyleSheet, View, useColorScheme } from 'react-native';

import { colors } from '../../theme';
import { getToolTheme } from '../../theme/toolTheme';

/**
 * Projekte's accent, as on web: the tool's blue on mostly white — `soft` for
 * fills (initials, badges, pinned), `accent` for icons, labels and buttons.
 */
export function useProjekteTone(): { soft: string; accent: string; strong: string } {
  const tone = getToolTheme('projekte', useColorScheme() === 'dark');
  return { soft: tone.tile, accent: tone.icon, strong: tone.title };
}

/** Behind every Projekte screen instead of the app's green-tinted gradient. */
export function ProjekteBackdrop() {
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
