import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';

import { type MentionSuggestion } from './mentionDraft';

interface MentionSuggestionsProps {
  suggestions: MentionSuggestion[];
  /** null: die System-Gruppe, die Zahl bleibt verborgen. */
  memberCount: number | null;
  onChoose: (s: MentionSuggestion) => void;
}

/** Die Vorschläge zu „@…“ als Liste über oder unter dem Feld; der Fokus bleibt im Feld. */
export function MentionSuggestions({
  suggestions,
  memberCount,
  onChoose,
}: MentionSuggestionsProps) {
  const theme = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <View
      accessibilityLabel="Erwähnen"
      style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      {suggestions.map((s) => (
        <Pressable
          key={s.kind === 'all' ? 'all' : s.userId}
          onPress={() => onChoose(s)}
          accessibilityRole="button"
          accessibilityLabel={s.kind === 'all' ? 'Alle erwähnen' : `${s.label} erwähnen`}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
        >
          {s.kind === 'all' ? (
            <>
              <Text style={[styles.name, { color: theme.text }]}>@alle</Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                {memberCount === null
                  ? 'benachrichtigt alle im Grünerator'
                  : `benachrichtigt alle ${memberCount} Mitglieder`}
              </Text>
            </>
          ) : (
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {s.label}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' },
  name: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  hint: { fontFamily: BODY_FONT, fontSize: 12 },
});
