import { parseScrapeResult } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

import { colors, spacing, borderRadius } from '../../../theme';

import type { Theme } from '../../../theme/colors';

interface ToolCallPart {
  args: Record<string, unknown>;
  result?: unknown;
}

// Native counterpart of web's ScrapeUrlResult / LinkPreview (scrape_url): a
// tappable preview card showing the domain + a text snippet; opens the URL.
export function ScrapeUrlCard({ part, theme }: { part: ToolCallPart; theme: Theme }) {
  const page = parseScrapeResult(part.args, part.result);
  const openHref = useCallback(() => {
    if (page?.url) void Linking.openURL(page.url);
  }, [page?.url]);

  if (!page) {
    return null;
  }

  return (
    <Pressable
      onPress={openHref}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? theme.surface : theme.card, borderColor: theme.cardBorder },
      ]}
    >
      <View style={styles.header}>
        <Ionicons name="open-outline" size={14} color={colors.secondary[700]} />
        <Text style={[styles.domain, { color: theme.text }]} numberOfLines={1}>
          {page.domain || page.url}
        </Text>
      </View>
      {page.snippet ? (
        <Text style={[styles.snippet, { color: theme.textSecondary }]} numberOfLines={3}>
          {page.snippet}
        </Text>
      ) : null}
    </Pressable>
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
  domain: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  snippet: {
    fontSize: 12,
    lineHeight: 17,
  },
});
