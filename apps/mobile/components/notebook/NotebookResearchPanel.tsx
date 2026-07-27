import { useFetchFullText } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Keyboard,
  useColorScheme,
} from 'react-native';
import { useShallow } from 'zustand/shallow';

import { getResearchCollectionIds } from '../../config/notebooksConfig';
import { useNotebookFilters } from '../../hooks/notebook/useNotebookFilters';
import {
  useNotebookResearch,
  type ResearchResult,
  type SearchMode,
  type SortOption,
} from '../../hooks/notebook/useNotebookResearch';
import { useNotebookFilterStore } from '../../stores/notebookFilterStore';
import { colors, spacing, typography, borderRadius, BODY_FONT } from '../../theme';
import { getSurfaceFab } from '../../theme/toolTheme';
import { routeWithParams } from '../../types/routes';
import { CitationDetailSheet } from '../chat/CitationDetailSheet';
import { BottomSheet } from '../common/BottomSheet';
import { Composer } from '../common/Composer';
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
const DEPTH_LABELS: Record<'fast' | 'deep', string> = {
  fast: 'Schnell',
  deep: 'Tiefenrecherche',
};
const DEPTH_CYCLE: ('fast' | 'deep')[] = ['fast', 'deep'];

/** Readable names for the aggregate notebook's `*-system` collections. */
const COLLECTION_LABELS: Record<string, string> = {
  'grundsatz-system': 'Grundsatzprogramm',
  'bundestagsfraktion-system': 'Bundestagsfraktion',
  'gruene-de-system': 'gruene.de',
  'kommunalwiki-system': 'KommunalWiki',
  'gruenblog-system': 'Grünblog',
};
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
  accent,
  onAccent,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: Theme;
  /** Fill of the selected state — the notebook magenta, not the app green. */
  accent: string;
  /** Readable colour on top of `accent`. */
  onAccent: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optionChip,
        {
          backgroundColor: active ? accent : theme.surface,
          borderColor: active ? accent : theme.border,
        },
      ]}
    >
      <Text style={[styles.optionChipText, { color: active ? onAccent : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function NotebookResearchPanel({ notebookId, kind, theme, notebookTitle }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [selected, setSelected] = useState<ResearchResult | null>(null);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  // Chat is the default input (a composer that hands off to the chat screen, like
  // the start screen); a search FAB switches to inline manuelle Recherche.
  const [inputMode, setInputMode] = useState<InputMode>('chat');

  const router = useRouter();
  const fetchFullText = useFetchFullText();
  // Facets, sources and depth live in a store, not in this component: asking hands
  // the question to another screen, and the chat runtime builds the request body
  // from outside the panel.
  const { keywordFilters, collectionIds, depth } = useNotebookFilterStore(
    useShallow((st) => ({
      keywordFilters: st.keywordFilters,
      collectionIds: st.collectionIds,
      depth: st.depth,
    }))
  );
  const setNotebook = useNotebookFilterStore((st) => st.setNotebook);
  const toggleValue = useNotebookFilterStore((st) => st.toggleValue);
  const toggleCollection = useNotebookFilterStore((st) => st.toggleCollection);
  const resetStoreFilters = useNotebookFilterStore((st) => st.reset);
  const setDepth = useNotebookFilterStore((st) => st.setDepth);
  const availableCollections = getResearchCollectionIds(notebookId);

  useEffect(() => {
    setNotebook(notebookId);
  }, [notebookId, setNotebook]);
  const fabTone = getSurfaceFab('wissen', useColorScheme() === 'dark');
  // Selected chips, badges and the send button carry the notebook's own hue; the
  // pastel side of the pair doubles as the readable colour on top of it.
  const accent = fabTone.icon;
  const onAccent = fabTone.background;

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

  // Both modes sit on the notebook's pink gradient (web parity) — the green wash
  // that used to mark manuelle Recherche fought that background.
  const toggleMode = useCallback(() => {
    setInputMode((m) => (m === 'chat' ? 'recherche' : 'chat'));
  }, []);
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
    (mode !== 'hybrid' ? 1 : 0) +
    (sortBy !== 'relevance' ? 1 : 0) +
    (depth !== 'fast' ? 1 : 0) +
    (collectionIds ? 1 : 0) +
    keywordFilterCount;

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

  const resetFilters = () => {
    setMode('hybrid');
    setSortBy('relevance');
    resetStoreFilters();
  };

  const canSearch = query.trim().length >= 2;

  return (
    <View style={styles.container}>
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
            <Text style={[styles.heroTitle, { color: theme.text }]}>{notebookTitle}</Text>
            <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
              Was möchtest du wissen?
            </Text>
          </View>
        )}

        {/* The input swaps with the mode: KI-Chat (card → hands off to the chat
            screen) by default, manuelle Recherche (inline search) via the FAB. */}
        {inputMode === 'chat' ? (
          <View style={styles.chatComposer}>
            <Composer
              variant="bar"
              placeholder={`Frag ${notebookTitle ?? 'dieses Notebook'}…`}
              onSubmit={handleChatSend}
              // Same sheet as manuelle Recherche — depth, sources and categories
              // shape the KI answer too, so it has to be reachable from here.
              onSettings={() => setFiltersSheetVisible(true)}
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
                  color={activeCount > 0 ? accent : theme.textSecondary}
                />
                {activeCount > 0 && (
                  <View style={[styles.filterBadge, { backgroundColor: accent }]}>
                    <Text style={styles.filterBadgeText}>{activeCount}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => runSearch()}
                style={[styles.sendButton, { backgroundColor: canSearch ? accent : theme.border }]}
                disabled={!canSearch}
              >
                <Ionicons name="arrow-forward" size={20} color={onAccent} />
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.body}>
          {inputMode === 'recherche' && (isLoading || hasSearched) ? (
            <>
              {isLoading && (
                <View style={styles.centerState}>
                  <ActivityIndicator size="large" color={accent} />
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
            <NotebookOverview notebookId={notebookId} kind={kind} theme={theme} />
          ) : null}
        </View>
      </ScrollView>

      {/* FAB toggles the input between KI-Chat (default) and manuelle Recherche. */}
      <Fab
        icon={inputMode === 'chat' ? 'search' : 'chatbubbles'}
        onPress={toggleMode}
        accessibilityLabel={inputMode === 'chat' ? 'Manuelle Recherche' : 'KI-Chat'}
        style={[styles.fab, { backgroundColor: fabTone.background }]}
        color={fabTone.icon}
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
              <Text style={[styles.resetText, { color: accent }]}>Zurücksetzen</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setFiltersSheetVisible(false)} hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.sheetScroll}>
          {/* KI-side setting: web's fast/deep toggle on the notebook page. The
              Suchmodus/Sortierung below only shape the manual research query. */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.text }]}>KI-Recherche</Text>
            <View style={styles.filterValues}>
              {DEPTH_CYCLE.map((d) => (
                <OptionChip
                  key={d}
                  label={DEPTH_LABELS[d]}
                  active={depth === d}
                  onPress={() => setDepth(d)}
                  theme={theme}
                  accent={accent}
                  onAccent={onAccent}
                />
              ))}
            </View>
          </View>

          {/* Only an aggregate notebook has something to pick from. */}
          {availableCollections.length > 1 && (
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Quellen</Text>
              <View style={styles.filterValues}>
                {availableCollections.map((id) => (
                  <OptionChip
                    key={id}
                    label={COLLECTION_LABELS[id] ?? id.replace(/-system$/, '')}
                    active={(collectionIds ?? availableCollections).includes(id)}
                    onPress={() => toggleCollection(id, availableCollections)}
                    theme={theme}
                    accent={accent}
                    onAccent={onAccent}
                  />
                ))}
              </View>
            </View>
          )}

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
                  accent={accent}
                  onAccent={onAccent}
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
                  accent={accent}
                  onAccent={onAccent}
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
                      onPress={() => toggleValue(field.field, v.value)}
                      style={[
                        styles.valueChip,
                        {
                          backgroundColor: isActive ? accent : theme.surface,
                          borderColor: isActive ? accent : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.valueText, { color: isActive ? onAccent : theme.text }]}
                        numberOfLines={1}
                      >
                        {v.value}
                      </Text>
                      <Text
                        style={[
                          styles.valueCount,
                          { color: isActive ? onAccent : theme.textSecondary },
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
          style={[styles.applyButton, { backgroundColor: accent }]}
        >
          <Text style={[styles.applyButtonText, { color: onAccent }]}>
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
  // One narrow row, like web's notebook composer — the tall multiline card ate a
  // third of the screen before a single result was on it.
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: 28,
    borderWidth: 1,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xsmall,
    marginHorizontal: spacing.medium,
    marginTop: spacing.medium,
    gap: spacing.xsmall,
  },
  composerInput: {
    ...typography.body,
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  composerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
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
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
    fontSize: 18,
    fontWeight: '700',
  },
  resetButton: {
    paddingHorizontal: spacing.xsmall,
  },
  resetText: {
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
    fontSize: 13,
  },
  valueCount: {
    fontFamily: BODY_FONT,
    fontSize: 11,
  },
  applyButton: {
    marginTop: spacing.medium,
    paddingVertical: 16,
    borderRadius: borderRadius.large,
    alignItems: 'center',
  },
  applyButtonText: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
  },
});
