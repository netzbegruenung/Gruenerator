import { type ResearchResult } from '@gruenerator/contracts';
import { LIVE_SEARCH_MIN_LENGTH, liveSearchDelayMs } from '@gruenerator/shared/api';
import { useAuth, useLiveResearch } from '@gruenerator/shared/hooks';
import { parseNotebookQuery } from '@gruenerator/shared/utils';
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

import { getResearchCollectionIds, getVisibleNotebooks } from '../../config/notebooksConfig';
import { useTheme } from '../../hooks/useTheme';
import { borderRadius, BODY_FONT, HEADING_FONT_BOLD, spacing, typography } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { BottomSheet } from '../common/BottomSheet';

import { ResearchResultCard } from './ResearchResultCard';

/**
 * Searches every notebook at once — what web's Wissen composer does when
 * asked for sources rather than an answer. A named region („Saarland
 * Hitzeschutz“) narrows to that notebook, a year to that time; everything
 * else goes to all searchable system collections.
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

  const scope = useMemo(() => {
    const parsed = parseNotebookQuery(query);
    const notebook = parsed.region
      ? getVisibleNotebooks(locale === 'de-AT' ? 'de-AT' : 'de-DE').find(
          (nb) => nb.title.toLowerCase() === parsed.region?.toLowerCase()
        )
      : undefined;
    const filters: Record<string, unknown> = {};
    if (parsed.dateFrom) filters.date_from = parsed.dateFrom;
    if (parsed.dateTo) filters.date_to = parsed.dateTo;
    return {
      // A region alone is no topic — keep the words it was named with.
      query: parsed.topic.trim().length >= 2 ? parsed.topic : query,
      collectionIds: notebook ? getResearchCollectionIds(notebook.id) : undefined,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      regionTitle: notebook?.title ?? null,
    };
  }, [query, locale]);

  const { results, metadata, isPending, isError } = useLiveResearch({
    query: scope.query,
    ...(scope.collectionIds && { collectionIds: scope.collectionIds }),
    ...(scope.filters && { filters: scope.filters }),
    enabled: visible && query.length >= LIVE_SEARCH_MIN_LENGTH,
  });

  const openHit = (hit: ResearchResult) => {
    if (!hit.collection_id || !hit.source_url) return;
    onClose();
    router.push(
      routeWithParams('/(focused)/notebook-reader', {
        collectionId: hit.collection_id,
        sourceUrl: hit.source_url,
        query: scope.query,
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
      {scope.regionTitle && searching && (
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          Eingegrenzt auf {scope.regionTitle}
        </Text>
      )}
      <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
        {searching && isPending && (
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
        {searching && !isPending && !isError && results.length === 0 && (
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
