import { parsePersonResult } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { View, Text, StyleSheet } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import type { Theme } from '../../../theme/colors';

// Native counterpart of web's CompactPersonResult (gruenerator_person_search):
// a small profile card with the politician's name, Fraktion and Wahlkreis.
export function PersonResultCard({ result, theme }: { result: unknown; theme: Theme }) {
  const person = parsePersonResult(result);

  if (!person.found) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.empty, { color: theme.textSecondary }]}>Keine Person gefunden</Text>
      </View>
    );
  }

  const meta = [person.fraktion, person.wahlkreis].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        <Ionicons name="person-circle-outline" size={18} color={colors.secondary[600]} />
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {person.name || 'Unbekannt'}
        </Text>
      </View>
      {meta.length > 0 && (
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {meta}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginBottom: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  name: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    marginLeft: 18 + spacing.xxsmall,
  },
  empty: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
