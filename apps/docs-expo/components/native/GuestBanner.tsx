import { View, Text, StyleSheet } from 'react-native';

import { colors } from '../../theme/colors';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';

export function GuestBanner() {
  const isGuest = useDocsEditorBridgeStore((s) => s.isGuest);
  const guestName = useDocsEditorBridgeStore((s) => s.guestName);
  const canEdit = useDocsEditorBridgeStore((s) => s.canEdit);

  if (!isGuest) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {canEdit ? 'Du bearbeitest' : 'Du liest'} als Gast
        {guestName ? ` (${guestName})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.primary[100],
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
    color: colors.primary[800],
  },
});
