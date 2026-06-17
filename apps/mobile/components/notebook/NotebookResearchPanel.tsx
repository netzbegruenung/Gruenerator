import { useFetchFullText } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';

import { useNotebookFilters } from '../../hooks/notebook/useNotebookFilters';
import {
  useNotebookResearch,
  type ResearchResult,
  type SearchMode,
  type SortOption,
} from '../../hooks/notebook/useNotebookResearch';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { CitationDetailSheet } from '../chat/CitationDetailSheet';
import { BottomSheet } from '../common/BottomSheet';
import { ComposerCard } from '../common/ComposerCard';
import { Fab } from '../common/Fab';

import { NotebookOverview } from './NotebookOverview';
import { ResearchResultCard } from './ResearchResultCard';

import type { Theme } from '../../theme/colors';
import type { Citation } from '@gruenerator/chat';

type InputMode = 'recherche' | 'chat';

interface Props {
  notebookId: string;
  kind: 'system' | 'user';
  theme: Theme;
  /** Notebook name shown as a homepage-style greeting on the pre-search landing. */
  notebookTitle?: string;
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

/** Single-select option pill used inside the filter sheet (no count). */
function OptionChip({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optionChip,
        {
          backgroundColor: active ? colors.primary[600] : theme.surface,
          borderColor: active ? colors.primary[600] : theme.border,
        },
      ]}
    >
      <Text style={[styles.optionChipText, { color: active ? colors.white : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function NotebookResearchPanel({ notebookId, kind, theme, notebookTitle }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [keywordFilters, setKeywordFilters] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<ResearchResult | null>(null);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  // Chat is the default input (a composer that hands off to the chat screen, like
  // the start screen); a search FAB switches to inline manuelle Recherche.
  const [inputMode, setInputMode] = useState<InputMode>('chat');

  const router = useRouter();
  const fetchFullText = useFetchFullText();

  const handleChatSend = useCallback(
    (text: string) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          notebookId,
          initialMessage: text,
        })
      );
    },
    [router, notebookId]
  );

  // Animated green wash + white text when switching to manuelle Recherche, so the
  // mode change reads instantly.
  const onGreen = inputMode === 'recherche';
  const greenProgress = useSharedValue(0);
  const toggleMode = useCallback(() => {
    setInputMode((m) => {
      const next = m === 'chat' ? 'recherche' : 'chat';
      greenProgress.value = withTiming(next === 'recherche' ? 1 : 0, { duration: 320 });
      return next;
    });
  }, [greenProgress]);
  const overlayStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      greenProgress.value,
      [0, 1],
      ['rgba(49, 96, 73, 0)', colors.primary[600]]
    ),
  }));
  const { search, results, metadata, isLoading, hasSearched, error } = useNotebookResearch(
    notebookId,
    kind
  );
  const { filterFields } = useNotebookFilters(notebookId, kind);
  const keywordFields = filterFields.filter(
    (f) => f.type === 'keyword' && f.values && f.values.length > 0
  );
  const keywordFilterCount = Object.values(keywordFilters).reduce((s, a) => s + a.length, 0);
  // One number across mode, sort, and keyword facets — the single Filter control
  // shows this so the whole search configuration lives behind one element.
  const activeCount =
    (mode !== 'hybrid' ? 1 : 0) + (sortBy !== 'relevance' ? 1 : 0) + keywordFilterCount;

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

  const resetFilters = () => {
    setMode('hybrid');
    setSortBy('relevance');
    setKeywordFilters({});
  };

  const canSearch = query.trim().length >= 2;

  return (
    <View style={styles.container}>
      {/* Animated green wash behind everything for manuelle Recherche mode. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayStyle]} />

      {/* One scroll for the whole tab — greeting, composer and results all scroll
          together, like the home screen (no fixed top section). */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Greeting always on top. */}
        {notebookTitle && (
          <View style={styles.hero}>
            <Text style={[styles.heroTitle, { color: onGreen ? colors.white : theme.text }]}>
              {notebookTitle}
            </Text>
            <Text
              style={[
                styles.heroSubtitle,
                { color: onGreen ? 'rgba(255,255,255,0.75)' : theme.textSecondary },
              ]}
            >
              Was möchtest du wissen?
            </Text>
          </View>
        )}

        {/* The input swaps with the mode: KI-Chat (card → hands off to the chat
            screen) by default, manuelle Recherche (inline search) via the FAB. */}
        {inputMode === 'chat' ? (
          <View style={styles.chatComposer}>
            <ComposerCard
              placeholder={`Frag ${notebookTitle ?? 'dieses Notebook'}…`}
              onSend={handleChatSend}
            />
          </View>
        ) : (
          <View
            style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
        <TextInput
          style={[styles.composerInput, { color: theme.text }]}
          placeholder="In diesem Notebook recherchieren…"
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          returnKeyType="search"
          autoCorrect={false}
          multiline
        />
        <View style={styles.composerToolbar}>
          <Pressable
            onPress={() => setFiltersSheetVisible(true)}
            style={styles.iconButton}
            hitSlop={6}
          >
            <Ionicons
              name="options-outline"
              size={22}
              color={activeCount > 0 ? colors.primary[600] : theme.textSecondary}
            />
            {activeCount > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: colors.primary[600] }]}>
                <Text style={styles.filterBadgeText}>{activeCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => runSearch()}
            style={[
              styles.sendButton,
              { backgroundColor: canSearch ? colors.primary[600] : theme.border },
            ]}
            disabled={!canSearch}
          >
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </Pressable>
        </View>
      </View>
        )}

        <View style={styles.body}>
          {inputMode === 'recherche' && (isLoading || hasSearched) ? (
            <>
              {isLoading && (
                <View style={styles.centerState}>
                  <ActivityIndicator size="large" color={theme.textGreen} />
                  <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                    Suche läuft…
                  </Text>
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

              {hasSearched && !isLoading && results.length === 0 && !error && (
                <View style={styles.centerState}>
                  <Ionicons name="document-outline" size={44} color={theme.textSecondary} />
                  <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                    Keine Ergebnisse gefunden.
                  </Text>
                </View>
              )}
            </>
          ) : kind === 'system' ? (
            <NotebookOverview notebookId={notebookId} kind={kind} theme={theme} onGreen={onGreen} />
          ) : null}
        </View>
      </ScrollView>

      {/* FAB toggles the input between KI-Chat (default) and manuelle Recherche. */}
      <Fab
        icon={inputMode === 'chat' ? 'search' : 'chatbubbles'}
        onPress={toggleMode}
        accessibilityLabel={inputMode === 'chat' ? 'Manuelle Recherche' : 'KI-Chat'}
        style={[styles.fab, onGreen ? { backgroundColor: colors.white } : null]}
        color={onGreen ? colors.primary[600] : colors.white}
      />

      <BottomSheet
        padded
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
      >
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Filter & Sortierung</Text>
          {activeCount > 0 && (
            <Pressable onPress={resetFilters} hitSlop={8} style={styles.resetButton}>
              <Text style={[styles.resetText, { color: theme.textGreen }]}>Zurücksetzen</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setFiltersSheetVisible(false)} hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.sheetScroll}>
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Suchmodus</Text>
            <View style={styles.filterValues}>
              {MODE_CYCLE.map((m) => (
                <OptionChip
                  key={m}
                  label={MODE_LABELS[m]}
                  active={mode === m}
                  onPress={() => setMode(m)}
                  theme={theme}
                />
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Sortierung</Text>
            <View style={styles.filterValues}>
              {SORT_CYCLE.map((s) => (
                <OptionChip
                  key={s}
                  label={SORT_LABELS[s]}
                  active={sortBy === s}
                  onPress={() => setSortBy(s)}
                  theme={theme}
                />
              ))}
            </View>
          </View>

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
                        style={[styles.valueText, { color: isActive ? colors.white : theme.text }]}
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
            {activeCount > 0 ? `${activeCount} aktiv · Anwenden` : 'Anwenden'}
          </Text>
        </Pressable>
      </BottomSheet>

      <CitationDetailSheet
        citation={selected ? toCitation(selected) : null}
        theme={theme}
        onClose={() => setSelected(null)}
        fetchFullText={fetchFullText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatComposer: {
    marginHorizontal: spacing.medium,
    marginTop: spacing.medium,
  },
  fab: {
    bottom: spacing.xlarge,
  },
  hero: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.large,
    paddingBottom: spacing.xsmall,
  },
  heroTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 26,
  },
  heroSubtitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 26,
    marginTop: 2,
  },
  composer: {
    borderRadius: borderRadius.large,
    borderWidth: 1,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
    marginHorizontal: spacing.medium,
    marginTop: spacing.medium,
    gap: spacing.small,
  },
  composerInput: {
    ...typography.body,
    fontSize: 16,
    minHeight: 52,
    maxHeight: 120,
    textAlignVertical: 'top',
    padding: 0,
  },
  composerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.small,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // Center the landing (greeting + composer) vertically now that there's no
    // header above — flexGrow lets it center when short and scroll when the
    // results/overview make it taller than the viewport.
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xxlarge,
  },
  body: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.medium,
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
    gap: spacing.small,
    marginBottom: spacing.small,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  resetButton: {
    paddingHorizontal: spacing.xsmall,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetScroll: {
    maxHeight: 400,
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
  optionChip: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: '500',
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
    paddingVertical: 16,
    borderRadius: borderRadius.large,
    alignItems: 'center',
  },
  applyButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
