import { View, Text, StyleSheet, useColorScheme } from 'react-native';

import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { colors, lightTheme, darkTheme } from '../../theme';

export function GuestBanner() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const isGuest = useDocsEditorBridgeStore((s) => s.isGuest);
  const guestName = useDocsEditorBridgeStore((s) => s.guestName);
  const canEdit = useDocsEditorBridgeStore((s) => s.canEdit);

  if (!isGuest) return null;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: isDark ? colors.primary[950] : colors.primary[100] },
      ]}
    >
      <Text style={[styles.text, { color: isDark ? theme.textGreen : colors.primary[800] }]}>
        {canEdit ? 'Du bearbeitest' : 'Du liest'} als Gast
        {guestName ? ` (${guestName})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
  },
});
