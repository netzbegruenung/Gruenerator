import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { useHiddenMembersStore } from '../../stores/hiddenMembersStore';
import { spacing, colors, BODY_FONT } from '../../theme';

export function HiddenMembersDetail() {
  const theme = useTheme();
  const hidden = useHiddenMembersStore((s) => s.hidden);
  const unhide = useHiddenMembersStore((s) => s.unhide);

  if (hidden.length === 0) {
    return (
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        Du hast niemanden ausgeblendet.
      </Text>
    );
  }

  return (
    <View style={styles.root}>
      {hidden.map((m) => (
        <View key={m.userId} style={styles.row}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {m.name}
          </Text>
          <Pressable
            onPress={() => unhide(m.userId)}
            accessibilityRole="button"
            accessibilityLabel={`${m.name} wieder einblenden`}
            hitSlop={6}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Wieder einblenden</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.small, minHeight: 44 },
  name: { flex: 1, fontFamily: BODY_FONT, fontSize: 16 },
  text: { fontFamily: BODY_FONT, fontSize: 15, lineHeight: 22 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  buttonText: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary[600],
  },
});
