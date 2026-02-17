import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Citation } from '../../services/chatStream';
import type { lightTheme, darkTheme } from '../../theme/colors';

interface Props {
  citations: Citation[];
  theme: typeof lightTheme | typeof darkTheme;
}

export function CitationsList({ citations, theme }: Props) {
  if (!citations || citations.length === 0) return null;

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Quellen</Text>
      {citations.slice(0, 5).map((citation) => (
        <Pressable
          key={citation.id}
          style={({ pressed }) => [
            styles.item,
            { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => {
            if (citation.url) Linking.openURL(citation.url);
          }}
        >
          <View style={styles.itemContent}>
            <Ionicons name="link-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {citation.title || citation.domain || citation.url}
            </Text>
          </View>
          {citation.domain && (
            <Text style={[styles.domain, { color: theme.textSecondary }]} numberOfLines={1}>
              {citation.domain}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderTopWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.small,
  },
  item: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    marginBottom: spacing.xxsmall,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  domain: {
    fontSize: 11,
    marginLeft: spacing.medium + spacing.xsmall,
    marginTop: 2,
  },
});
