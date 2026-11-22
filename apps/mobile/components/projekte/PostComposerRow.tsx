import { personInitials } from '@gruenerator/shared/groups';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';

import { useProjekteTone } from './projekteTone';

interface PostComposerRowProps {
  userName: string | null;
  onPress: () => void;
  /** Im System-Projekt gibt es keine „Gruppe“. */
  placeholder?: string;
}

/** Wie im Web die zugeklappte Zeile über dem Feed: ein Tipp öffnet das Beitragsblatt. */
export function PostComposerRow({
  userName,
  onPress,
  placeholder = 'Schreib etwas an das Projekt …',
}: PostComposerRowProps) {
  const theme = useTheme();
  const tone = useProjekteTone();
  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={[styles.avatar, { backgroundColor: tone.soft }]}>
        <Text style={[styles.avatarText, { color: tone.accent }]}>{personInitials(userName)}</Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Beitrag schreiben"
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: theme.buttonBackground, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.placeholder, { color: theme.textSecondary }]} numberOfLines={1}>
          {placeholder}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 20 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  field: { flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center' },
  placeholder: { fontFamily: BODY_FONT, fontSize: 15 },
});
