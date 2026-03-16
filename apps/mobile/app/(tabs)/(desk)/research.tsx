import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  TextInput,
  Pressable,
  ActivityIndicator,
  Linking,
  Keyboard,
} from 'react-native';

import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

interface ResearchResult {
  document_id: string;
  title: string;
  source_url: string | null;
  relevant_content: string;
  similarity_score: number;
  collection_id?: string;
  collection_name?: string;
}

interface ResearchMetadata {
  totalResults: number;
  collections: string[];
  timeMs: number;
}

const EXAMPLE_QUERIES = [
  { icon: '🌍', text: 'Klimaschutz' },
  { icon: '🚲', text: 'Verkehrswende' },
  { icon: '📚', text: 'Bildungspolitik' },
  { icon: '⚡', text: 'Energiewende' },
];

export default function ResearchScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [metadata, setMetadata] = useState<ResearchMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

    Keyboard.dismiss();
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const apiClient = getGlobalApiClient();
      const response = await apiClient.post('/research/search', { query: trimmed });

      setResults(response.data.results || []);
      setMetadata(response.data.metadata || null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Suche fehlgeschlagen. Bitte erneut versuchen.';
      setError(message);
      setResults([]);
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    search(query);
  }, [query, search]);

  const handleExamplePress = useCallback(
    (text: string) => {
      setQuery(text);
      search(text);
    },
    [search]
  );

  const handleResultPress = useCallback((url: string | null) => {
    if (url) Linking.openURL(url);
  }, []);

  const scorePercent = (score: number) => `${Math.round(score * 100)}%`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Dokumente durchsuchen..."
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </Pressable>
        )}
        <Pressable
          onPress={handleSearch}
          style={[styles.searchButton, { backgroundColor: colors.primary[600] }]}
          disabled={query.trim().length < 2}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </Pressable>
      </View>

      {!hasSearched && !isLoading && (
        <View style={styles.examplesSection}>
          <Text style={[styles.examplesLabel, { color: theme.textSecondary }]}>Beispielsuchen</Text>
          <View style={styles.exampleChips}>
            {EXAMPLE_QUERIES.map((eq, i) => (
              <Pressable
                key={i}
                onPress={() => handleExamplePress(eq.text)}
                style={({ pressed }) => [
                  styles.exampleChip,
                  {
                    backgroundColor: pressed ? colors.primary[100] : theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.exampleChipText, { color: theme.text }]}>
                  {eq.icon} {eq.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Suche läuft...</Text>
        </View>
      )}

      {error && (
        <View style={[styles.errorBox, { backgroundColor: colors.error[500] + '15' }]}>
          <Ionicons name="alert-circle" size={20} color={colors.error[500]} />
          <Text style={[styles.errorText, { color: colors.error[500] }]}>{error}</Text>
        </View>
      )}

      {metadata && !isLoading && (
        <Text style={[styles.metaText, { color: theme.textSecondary }]}>
          {metadata.totalResults} Ergebnisse in {metadata.timeMs} ms
        </Text>
      )}

      {results.map((result) => (
        <Pressable
          key={result.document_id}
          onPress={() => handleResultPress(result.source_url)}
          style={({ pressed }) => [
            styles.resultCard,
            {
              backgroundColor: pressed ? theme.surface : theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
          disabled={!result.source_url}
        >
          <View style={styles.resultHeader}>
            <Text style={[styles.resultTitle, { color: theme.text }]} numberOfLines={2}>
              {result.title}
            </Text>
            <View style={[styles.scoreBadge, { backgroundColor: colors.primary[600] + '20' }]}>
              <Text style={[styles.scoreText, { color: colors.primary[600] }]}>
                {scorePercent(result.similarity_score)}
              </Text>
            </View>
          </View>

          {result.collection_name && (
            <View style={[styles.collectionBadge, { backgroundColor: theme.surface }]}>
              <Ionicons name="library-outline" size={12} color={theme.textSecondary} />
              <Text style={[styles.collectionText, { color: theme.textSecondary }]}>
                {result.collection_name}
              </Text>
            </View>
          )}

          <Text style={[styles.resultContent, { color: theme.textSecondary }]} numberOfLines={4}>
            {result.relevant_content}
          </Text>

          {result.source_url && (
            <View style={styles.linkRow}>
              <Ionicons name="open-outline" size={14} color={colors.primary[600]} />
              <Text style={[styles.linkText, { color: colors.primary[600] }]} numberOfLines={1}>
                {result.source_url}
              </Text>
            </View>
          )}
        </Pressable>
      ))}

      {hasSearched && !isLoading && results.length === 0 && !error && (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Keine Ergebnisse gefunden
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
    gap: spacing.small,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.xsmall,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.xsmall,
  },
  searchButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examplesSection: {
    gap: spacing.small,
    marginTop: spacing.medium,
  },
  examplesLabel: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exampleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  exampleChip: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  exampleChipText: {
    ...typography.bodySmall,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  loadingText: {
    ...typography.body,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
  },
  errorText: {
    ...typography.body,
    flex: 1,
  },
  metaText: {
    ...typography.caption,
    textAlign: 'right',
  },
  resultCard: {
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.xsmall,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.small,
  },
  resultTitle: {
    ...typography.bodyBold,
    flex: 1,
  },
  scoreBadge: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.small,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  collectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.small,
  },
  collectionText: {
    fontSize: 11,
    fontWeight: '500',
  },
  resultContent: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xxsmall,
  },
  linkText: {
    fontSize: 12,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  emptyText: {
    ...typography.body,
  },
});
