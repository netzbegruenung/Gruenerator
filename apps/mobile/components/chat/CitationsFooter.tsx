import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { Citation } from '@gruenerator/chat';

interface Props {
  citations: Citation[];
  theme: Theme;
}

export function CitationsFooter({ citations, theme }: Props) {
  if (!citations || citations.length === 0) return null;

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Quellen</Text>
      {citations.slice(0, 5).map((citation, idx) => (
        <Pressable
          key={citation.id ?? idx}
          style={({ pressed }) => [
            styles.item,
            { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => {
            if (citation.url) Linking.openURL(citation.url);
          }}
        >
          <View style={styles.itemContent}>
            <Ionicons name="link-outline" size={14} color={theme.textSecondary} />
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {citation.title || citation.url}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.small,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: spacing.xxsmall,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  item: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.small,
    marginBottom: 2,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
});
