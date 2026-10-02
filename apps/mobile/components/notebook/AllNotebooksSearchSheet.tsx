import { type ResearchResult } from '@gruenerator/contracts';
import { LIVE_SEARCH_MIN_LENGTH, liveSearchDelayMs } from '@gruenerator/shared/api';
import { useAuth, useLiveResearch, useResearchFacets } from '@gruenerator/shared/hooks';
import {
  activeFiltersToApi,
  describeParsedFilters,
  parsedSearchScope,
  parseResearchIntent,
} from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { getResearchRegions } from '../../config/notebooksConfig';
import { useTheme } from '../../hooks/useTheme';
import { borderRadius, BODY_FONT, HEADING_FONT_BOLD, spacing, typography } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { BottomSheet } from '../common/BottomSheet';

import { ParsedFilterChips } from './ParsedFilterChips';
import { ResearchResultCard } from './ResearchResultCard';

/**
 * Searches every notebook at once — what web's Wissen composer does when
 * asked for sources rather than an answer. The query is read by the same
 * parser: a named region („Saarland Hitzeschutz“) narrows to that notebook, a
 * date phrase, theme or person becomes a filter, each droppable as a chip;
 * everything else goes to all searchable system collections.
 */
export function AllNotebooksSearchSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { locale } = useAuth();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const trimmed = text.trim();
    const timer = setTimeout(() => setQuery(trimmed), liveSearchDelayMs(text));
    return () => clearTimeout(timer);
  }, [text]);

  // The vocabulary of every searchable collection — themes and persons are
  // only recognised when the collections carry them.
  const facets = useResearchFacets({ collectionIds: [], enabled: visible });
  const regions = useMemo(
    () => getResearchRegions(locale === 'de-AT' ? 'de-AT' : 'de-DE'),
    [locale]
  );
  const parsed = useMemo(
    () => parseResearchIntent(query, { regions, filterFields: facets.data ?? {} }),
    [query, regions, facets.data]
  );
  // Dropped chips hold for the query they were dropped on.
  const [droppedFor, setDroppedFor] = useState<{ query: string; keys: Set<string> }>({
    query: '',
    keys: new Set(),
  });
  const dropped = droppedFor.query === query ? droppedFor.keys : new Set<string>();
  const chips = describeParsedFilters(parsed).filter((c) => !dropped.has(c.key));
  const scope = parsedSearchScope(parsed, dropped);
  const apiFilters = activeFiltersToApi(scope.filters);

  const { results, metadata, isPending, isError } = useLiveResearch({
    query: parsed.semanticQuery,
    ...(scope.collectionIds && { collectionIds: scope.collectionIds }),
    ...(apiFilters && { filters: apiFilters }),
    ...(parsed.sortBy && { sortBy: parsed.sortBy }),
    enabled: visible && query.length >= LIVE_SEARCH_MIN_LENGTH && !facets.isLoading,
  });

  const openHit = (hit: ResearchResult) => {
    if (!hit.collection_id || !hit.source_url) return;
    onClose();
    router.push(
      routeWithParams('/(focused)/notebook-reader', {
        collectionId: hit.collection_id,
        sourceUrl: hit.source_url,
        query: parsed.residualQuery,
        title: hit.title,
      })
    );
  };

  const searching = query.length >= LIVE_SEARCH_MIN_LENGTH;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      padded
      keyboardAvoiding
      maxHeight="90%"
      backgroundColor={isDark ? theme.background : theme.surface}
    >
      <Text style={[styles.title, { color: theme.text }]}>Alle Notebooks durchsuchen</Text>
      <View
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
      >
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.inputText, { color: theme.text }]}
          value={text}
          onChangeText={setText}
          placeholder="Stichwort, Region, Jahr …"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Alle Notebooks durchsuchen"
          returnKeyType="search"
          onSubmitEditing={() => setQuery(text.trim())}
          autoCorrect={false}
          autoFocus
        />
      </View>
      {searching && (
        <ParsedFilterChips
          chips={chips}
          onDrop={(key) => setDroppedFor({ query, keys: new Set(dropped).add(key) })}
        />
      )}
      <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
        {searching && (isPending || facets.isLoading) && (
          <ActivityIndicator style={styles.state} color={theme.textSecondary} />
        )}
        {searching && isError && (
          <Text style={[styles.state, { color: theme.textSecondary }]}>
            Suche fehlgeschlagen. Bitte erneut versuchen.
          </Text>
        )}
        {searching && metadata && (
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {metadata.totalResults} Ergebnisse
          </Text>
        )}
        {searching &&
          results.map((hit) => (
            <ResearchResultCard
              key={`${hit.collection_id ?? ''}:${hit.document_id}`}
              result={hit}
              theme={theme}
              onPress={openHit}
            />
          ))}
        {searching && !isPending && !facets.isLoading && !isError && results.length === 0 && (
          <Text style={[styles.state, { color: theme.textSecondary }]}>
            Keine Ergebnisse gefunden.
          </Text>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 20,
    marginBottom: spacing.medium,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.medium,
  },
  inputText: {
    flex: 1,
    paddingVertical: spacing.small,
    fontFamily: BODY_FONT,
    ...typography.body,
  },
  results: {
    marginTop: spacing.small,
  },
  meta: {
    marginVertical: spacing.small,
    fontFamily: BODY_FONT,
    ...typography.caption,
  },
  state: {
    marginTop: spacing.large,
    textAlign: 'center',
    fontFamily: BODY_FONT,
  },
});
