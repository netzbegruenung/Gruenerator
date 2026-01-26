import { View, Text, Pressable, StyleSheet, useColorScheme, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import { extractMainDomain } from '@gruenerator/shared/search';
import type { SearchResult } from '@gruenerator/shared/search';

interface SourceCardProps {
  source: SearchResult;
}

export function SourceCard({ source }: SourceCardProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handlePress = () => {
    Linking.openURL(source.url);
  };

  const snippet = source.content_snippets || source.snippet || source.content;
  const displaySnippet =
    snippet && snippet.length > 150 ? `${snippet.substring(0, 150)}...` : snippet;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {source.title}
        </Text>
        <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
      </View>

      {displaySnippet && (
        <Text style={[styles.snippet, { color: theme.textSecondary }]} numberOfLines={3}>
          {displaySnippet}
        </Text>
      )}

      <View style={styles.footer}>
        <Ionicons name="globe-outline" size={12} color={colors.primary[600]} />
        <Text style={[styles.domain, { color: colors.primary[600] }]}>
          {extractMainDomain(source.url)}
        </Text>
      </View>
    </Pressable>
  );
}

interface SourceListProps {
  sources: SearchResult[];
  title?: string;
}

export function SourceList({ sources, title }: SourceListProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  if (!sources || sources.length === 0) return null;

  return (
    <View style={styles.listContainer}>
      {title && <Text style={[styles.listTitle, { color: theme.text }]}>{title}</Text>}
      {sources.map((source, index) => (
        <SourceCard key={`${source.url}-${index}`} source={source} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.small,
  },
  title: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  snippet: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
  },
  domain: {
    ...typography.caption,
  },
  listContainer: {
    gap: spacing.small,
  },
  listTitle: {
    ...typography.h3,
    marginBottom: spacing.xsmall,
  },
});

export default SourceCard;
