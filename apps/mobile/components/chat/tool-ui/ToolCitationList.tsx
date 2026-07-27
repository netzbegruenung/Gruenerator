import { type SerializableCitation } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

import { spacing, borderRadius, BODY_FONT } from '../../../theme';

import type { Theme } from '../../../theme/colors';

// Native equivalent of web's CitationList for tool results. Web renders a Radix
// popover per citation; on mobile a tap opens the source URL in the browser.
export function ToolCitationList({
  citations,
  theme,
}: {
  citations: SerializableCitation[];
  theme: Theme;
}) {
  const openHref = useCallback((href: string) => {
    if (href) void Linking.openURL(href);
  }, []);

  if (citations.length === 0) {
    return <Text style={[styles.empty, { color: theme.textSecondary }]}>Keine Ergebnisse</Text>;
  }

  return (
    <View style={styles.list}>
      {citations.map((c, i) => (
        <Pressable
          key={c.id}
          onPress={() => openHref(c.href)}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
        >
          <Text style={[styles.number, { color: theme.textSecondary }]}>[{i + 1}]</Text>
          <View style={styles.body}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {c.title}
            </Text>
            {(c.domain || c.snippet) && (
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {c.domain ? c.domain : c.snippet}
              </Text>
            )}
          </View>
          {c.href ? <Ionicons name="open-outline" size={14} color={theme.textSecondary} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
  },
  empty: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.small,
  },
  number: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '500',
  },
  meta: {
    fontFamily: BODY_FONT,
    fontSize: 11,
  },
});
