import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from 'react-native';

import { useNotebookFilters } from '../../hooks/notebook/useNotebookFilters';
import {
  useNotebookResearch,
  type ResearchResult,
  type SearchMode,
  type SortOption,
} from '../../hooks/notebook/useNotebookResearch';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { CitationDetailSheet } from '../chat/CitationDetailSheet';
import { BottomSheet } from '../common/BottomSheet';

import { ResearchResultCard } from './ResearchResultCard';

import type { Theme } from '../../theme/colors';
import type { Citation } from '@gruenerator/chat';

interface Props {
  notebookId: string;
  kind: 'system' | 'user';
  theme: Theme;
}

const MODE_LABELS: Record<SearchMode, string> = {
  hybrid: 'Hybrid',
  vector: 'Semantisch',
  text: 'Volltext',
};
const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Relevanz',
  date_desc: 'Neueste',
  date_asc: 'Älteste',
};
const MODE_CYCLE: SearchMode[] = ['hybrid', 'vector', 'text'];
const SORT_CYCLE: SortOption[] = ['relevance', 'date_desc', 'date_asc'];

const KEYWORD_FILTER_LABELS: Record<string, string> = {
  content_type: 'Inhaltstyp',
  primary_category: 'Kategorie',
  subcategories: 'Unterkategorien',
  country: 'Land',
  source_type: 'Organ',
};

/** Map a chunk-level research result onto the shared Citation shape the detail sheet renders. */
const toCitation = (r: ResearchResult): Citation => ({
  id: r.top_chunks?.[0]?.chunk_index ?? 0,
  title: r.title,
  url: r.source_url ?? '',
  snippet: r.relevant_content,
  citedText: r.top_chunks?.[0]?.preview ?? r.relevant_content,
  source: r.collection_name ?? r.source_url ?? '',
  collectionName: r.collection_name ?? undefined,
  collectionId: r.collection_id ?? undefined,
  documentId: r.document_id,
  similarityScore: r.similarity_score,
  chunkIndex: r.top_chunks?.[0]?.chunk_index,
});

function FilterChip({
  label,
  active,
  onPress,
  icon,
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: IoniconsIconName;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary[600] : theme.surface,
          borderColor: active ? colors.primary[600] : theme.border,
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={active ? colors.white : theme.textSecondary} />
      <Text style={[styles.chipText, { color: active ? colors.white : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function NotebookResearchPanel({ notebookId, kind, theme }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [keywordFilters, setKeywordFilters] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<ResearchResult | null>(null);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);

  const { search, results, metadata, isLoading, hasSearched, error } = useNotebookResearch(
    notebookId,
    kind
  );
  const { showActionSheetWithOptions } = useActionSheet();
  const { filterFields } = useNotebookFilters(notebookId, kind);
  const keywordFields = filterFields.filter(
    (f) => f.type === 'keyword' && f.values && f.values.length > 0
  );
  const keywordFilterCount = Object.values(keywordFilters).reduce((s, a) => s + a.length, 0);

  const runSearch = useCallback(
    (overrides?: {
      mode?: SearchMode;
      sortBy?: SortOption;
      filters?: Record<string, string[]>;
    }) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return;
      Keyboard.dismiss();
      search({
        query: trimmed,
        mode: overrides?.mode ?? mode,
        sortBy: overrides?.sortBy ?? sortBy,
        filters: overrides?.filters ?? keywordFilters,
      });
    },
    [query, mode, sortBy, keywordFilters, search]
  );

  const pickMode = () => {
    const labels = MODE_CYCLE.map((m) => MODE_LABELS[m]);
    showActionSheetWithOptions(
      {
        title: 'Suchmodus',
        options: [...labels, 'Abbrechen'],
        cancelButtonIndex: labels.length,
      },
      (i) => {
        if (i == null || i >= labels.length) return;
        const next = MODE_CYCLE[i];
        setMode(next);
        if (hasSearched) runSearch({ mode: next });
      }
    );
  };
  const pickSort = () => {
    const labels = SORT_CYCLE.map((s) => SORT_LABELS[s]);
    showActionSheetWithOptions(
      {
        title: 'Sortierung',
        options: [...labels, 'Abbrechen'],
        cancelButtonIndex: labels.length,
      },
      (i) => {
        if (i == null || i >= labels.length) return;
        const next = SORT_CYCLE[i];
        setSortBy(next);
        if (hasSearched) runSearch({ sortBy: next });
      }
    );
  };

  const toggleFilterValue = (field: string, value: string) => {
    setKeywordFilters((prev) => {
      const current = prev[field] ?? [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length === 0) {
        const { [field]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: updated };
    });
  };

  const showFilterChip = kind === 'system' && keywordFields.length > 0;

  return (
    <View style={styles.container}>
      <View
        style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="In diesem Notebook recherchieren…"
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </Pressable>
        )}
        <Pressable
          onPress={() => runSearch()}
          style={[styles.searchButton, { backgroundColor: colors.primary[600] }]}
          disabled={query.trim().length < 2}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipBarScroll}
        contentContainerStyle={styles.chipBar}
      >
        <FilterChip
          label={MODE_LABELS[mode]}
          active={mode !== 'hybrid'}
          onPress={pickMode}
          icon="options-outline"
          theme={theme}
        />
        <FilterChip
          label={SORT_LABELS[sortBy]}
          active={sortBy !== 'relevance'}
          onPress={pickSort}
          icon="swap-vertical-outline"
          theme={theme}
        />
        {showFilterChip && (
          <FilterChip
            label={keywordFilterCount > 0 ? `Filter (${keywordFilterCount})` : 'Filter'}
            active={keywordFilterCount > 0}
            onPress={() => setFiltersSheetVisible(true)}
            icon="funnel-outline"
            theme={theme}
          />
        )}
      </ScrollView>

      <ScrollView
        style={styles.resultsScroll}
        contentContainerStyle={styles.resultsContent}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.stateText, { color: theme.textSecondary }]}>Suche läuft…</Text>
          </View>
        )}

        {error && !isLoading && (
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

        {!isLoading &&
          results.map((result) => (
            <ResearchResultCard
              key={result.document_id}
              result={result}
              theme={theme}
              onPress={setSelected}
            />
          ))}

        {!hasSearched && !isLoading && (
          <View style={styles.centerState}>
            <Ionicons name="search-outline" size={44} color={theme.textSecondary} />
            <Text style={[styles.stateText, { color: theme.textSecondary }]}>
              Durchsuche die Dokumente dieses Notebooks.
            </Text>
          </View>
        )}

        {hasSearched && !isLoading && results.length === 0 && !error && (
          <View style={styles.centerState}>
            <Ionicons name="document-outline" size={44} color={theme.textSecondary} />
            <Text style={[styles.stateText, { color: theme.textSecondary }]}>
              Keine Ergebnisse gefunden.
            </Text>
          </View>
        )}
      </ScrollView>

      {showFilterChip && (
        <BottomSheet visible={filtersSheetVisible} onClose={() => setFiltersSheetVisible(false)}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Filter</Text>
            <Pressable onPress={() => setFiltersSheetVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.sheetScroll}>
            {keywordFields.map((field) => (
              <View key={field.field} style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: theme.text }]}>
                  {KEYWORD_FILTER_LABELS[field.field] ?? field.label}
                </Text>
                <View style={styles.filterValues}>
                  {field.values!.map((v) => {
                    const isActive = (keywordFilters[field.field] ?? []).includes(v.value);
                    return (
                      <Pressable
                        key={v.value}
                        onPress={() => toggleFilterValue(field.field, v.value)}
                        style={[
                          styles.valueChip,
                          {
                            backgroundColor: isActive ? colors.primary[600] : theme.surface,
                            borderColor: isActive ? colors.primary[600] : theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.valueText,
                            { color: isActive ? colors.white : theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {v.value}
                        </Text>
                        <Text
                          style={[
                            styles.valueCount,
                            { color: isActive ? colors.primary[200] : theme.textSecondary },
                          ]}
                        >
                          {v.count}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => {
              setFiltersSheetVisible(false);
              runSearch();
            }}
            style={[styles.applyButton, { backgroundColor: colors.primary[600] }]}
          >
            <Text style={styles.applyButtonText}>
              {keywordFilterCount > 0
                ? `${keywordFilterCount} Filter anwenden`
                : 'Ohne Filter suchen'}
            </Text>
          </Pressable>
        </BottomSheet>
      )}

      <CitationDetailSheet
        citation={selected ? toCitation(selected) : null}
        theme={theme}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.xsmall,
    marginHorizontal: spacing.medium,
    marginTop: spacing.small,
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
  chipBarScroll: {
    flexGrow: 0,
  },
  chipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  resultsScroll: {
    flex: 1,
  },
  resultsContent: {
    padding: spacing.medium,
    paddingTop: 0,
    gap: spacing.small,
  },
  centerState: {
    alignItems: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  stateText: {
    ...typography.body,
    textAlign: 'center',
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
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.small,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sheetScroll: {
    maxHeight: 360,
  },
  filterSection: {
    marginTop: spacing.medium,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xsmall,
  },
  filterValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  valueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  valueText: {
    fontSize: 13,
  },
  valueCount: {
    fontSize: 11,
  },
  applyButton: {
    marginTop: spacing.medium,
    paddingVertical: 14,
    borderRadius: borderRadius.large,
    alignItems: 'center',
  },
  applyButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
