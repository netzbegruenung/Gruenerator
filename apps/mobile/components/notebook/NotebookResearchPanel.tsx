import {
  DEFAULT_NOTEBOOK_ANSWER_MODE,
  DEFAULT_NOTEBOOK_DEPTH,
  NOTEBOOK_COMPOSER_MODES,
  NOTEBOOK_DEPTHS,
  composerModeRunsLiveSearch,
  composerSubmitAction,
  notebookComposerModeDef,
  notebookDepthDef,
  useFetchFullText,
} from '@gruenerator/chat';
import { type ResearchResult } from '@gruenerator/contracts';
import {
  LIVE_SEARCH_MIN_LENGTH,
  liveSearchDelayMs,
  type ResearchSearchMode as SearchMode,
  type ResearchSortOption as SortOption,
} from '@gruenerator/shared/api';
import { useLiveResearch } from '@gruenerator/shared/hooks';
import {
  activeFiltersToApi,
  describeParsedFilters,
  mergeParsedFilters,
  parsedSearchScope,
  parseResearchIntent,
} from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Keyboard,
  useColorScheme,
} from 'react-native';
import { useShallow } from 'zustand/shallow';

import { collectionLabel, getResearchCollectionIds } from '../../config/notebooksConfig';
import { useNotebookFilters } from '../../hooks/notebook/useNotebookFilters';
import { useNotebookFilterStore } from '../../stores/notebookFilterStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { colors, spacing, typography, borderRadius, BODY_FONT } from '../../theme';
import { getSurfaceFab } from '../../theme/toolTheme';
import { routeWithParams } from '../../types/routes';
import { CitationDetailSheet } from '../chat/CitationDetailSheet';
import { BottomComposerBar } from '../common/BottomComposerBar';
import { BottomSheet } from '../common/BottomSheet';
import { CenteredGreeting } from '../common/CenteredGreeting';

import { NotebookAnswerModeSheet, useAnswerModeAccessory } from './NotebookAnswerModeSheet';
import { ParsedFilterChips } from './ParsedFilterChips';
import { ResearchResultCard } from './ResearchResultCard';

import type { Theme } from '../../theme/colors';
import type { Citation } from '@gruenerator/chat';

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
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
    >
      <Text style={[styles.optionChipText, { color: active ? onAccent : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function NotebookResearchPanel({ notebookId, kind, theme, notebookTitle }: Props) {
  // The draft as typed, and what the live search runs on: the same text, held
  // back until a word is finished (or submitted).
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [selected, setSelected] = useState<ResearchResult | null>(null);
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [answerModeSheetVisible, setAnswerModeSheetVisible] = useState(false);

  const router = useRouter();
  const fetchFullText = useFetchFullText();
  // Facets and sources live in a store, not in this component: asking hands the
  // question to another screen, and the notebook chat reads them from there.
  const { keywordFilters, collectionIds } = useNotebookFilterStore(
    useShallow((st) => ({
      keywordFilters: st.keywordFilters,
      collectionIds: st.collectionIds,
    }))
  );
  const setNotebook = useNotebookFilterStore((st) => st.setNotebook);
  const toggleValue = useNotebookFilterStore((st) => st.toggleValue);
  const toggleCollection = useNotebookFilterStore((st) => st.toggleCollection);
  const resetStoreFilters = useNotebookFilterStore((st) => st.reset);
  // The depth is a persisted preference, not a per-notebook filter.
  const depth = usePreferencesStore((st) => st.notebookDepth);
  const setDepth = usePreferencesStore((st) => st.setNotebookDepth);
  const answerMode = usePreferencesStore((st) => st.notebookAnswerMode);
  const setAnswerMode = usePreferencesStore((st) => st.setNotebookAnswerMode);
  const openAnswerModeSheet = useCallback(() => setAnswerModeSheetVisible(true), []);
  const answerModeAccessory = useAnswerModeAccessory(openAnswerModeSheet, { withManual: true });
  const availableCollections = getResearchCollectionIds(notebookId);

  useEffect(() => {
    setNotebook(notebookId);
  }, [notebookId, setNotebook]);
  const fabTone = getSurfaceFab('wissen', useColorScheme() === 'dark');
  // Selected chips, badges and the send button carry the notebook's own hue; the
  // pastel side of the pair doubles as the readable colour on top of it.
  const accent = fabTone.icon;
  const onAccent = fabTone.background;

  // Web's start page: Magic and Manuell search the sources while the person
  // types; Magic then sends a question to the chat and keeps keywords a search.
  const runsLiveSearch = composerModeRunsLiveSearch(answerMode);
  const submitAction = composerSubmitAction(answerMode, text);
  // What the options sheet shows: the answer settings wherever a chat can
  // start, search mode and sort wherever the sources are searched.
  const asksModel = answerMode !== 'manuell';

  useEffect(() => {
    const trimmed = text.trim();
    const timer = setTimeout(() => setQuery(trimmed), liveSearchDelayMs(text));
    return () => clearTimeout(timer);
  }, [text]);

  const { facets, filterFields, isLoading: facetsLoading } = useNotebookFilters(notebookId, kind);
  const keywordFields = filterFields.filter(
    (f) => f.type === 'keyword' && f.values && f.values.length > 0
  );
  const keywordFilterCount = Object.values(keywordFilters).reduce((s, a) => s + a.length, 0);
  // A user notebook is scoped by its id on its own route, which has no facets;
  // a system notebook searches its `*-system` collections, narrowed by the
  // source picker.
  // Like web's live search, a system notebook reads its query: a date phrase,
  // a theme or a person it carries become filters (droppable as chips), and
  // what is left is searched. A user notebook's route has no facets.
  const parsed = useMemo(
    () =>
      kind === 'system' && query.length >= LIVE_SEARCH_MIN_LENGTH
        ? parseResearchIntent(query, { filterFields: facets, scopeFixed: true })
        : null,
    [kind, query, facets]
  );
  // Dropped chips hold for the query they were dropped on.
  const [droppedFor, setDroppedFor] = useState<{ query: string; keys: Set<string> }>({
    query: '',
    keys: new Set(),
  });
  const dropped = droppedFor.query === query ? droppedFor.keys : new Set<string>();
  const chips = parsed ? describeParsedFilters(parsed).filter((c) => !dropped.has(c.key)) : [];
  const parsedFilters = parsed ? parsedSearchScope(parsed, dropped).filters : {};
  const apiFilters = activeFiltersToApi(mergeParsedFilters(keywordFilters, parsedFilters));
  const residual = parsed?.residualQuery ?? query;
  const live = useLiveResearch({
    query: residual.length >= LIVE_SEARCH_MIN_LENGTH ? residual : query,
    mode,
    // An order chosen in the options wins over a recency word in the query.
    sortBy: sortBy === 'relevance' && parsed?.sortBy ? parsed.sortBy : sortBy,
    ...(kind === 'user'
      ? { notebookId }
      : {
          collectionIds: collectionIds ?? availableCollections,
          ...(apiFilters && { filters: apiFilters }),
        }),
    // Without the vocabulary the query reads differently; searching before it
    // arrives would be replaced by a second search right after.
    enabled: runsLiveSearch && !facetsLoading,
  });
  const searchPending = live.isPending || facetsLoading;
  const showsResults = runsLiveSearch && query.length >= LIVE_SEARCH_MIN_LENGTH;
  // Web's start page: the greeting folds away once the first hits are on
  // screen, not with the first keystroke, and stays away when the field is
  // cleared — the page never jumps back and forth. Only leaving the
  // live-search modes brings it back.
  const [raised, setRaised] = useState(false);
  if (raised && !runsLiveSearch) setRaised(false);
  if (!raised && showsResults && live.metadata) setRaised(true);

  // Eine Zahl über alles, was im aktuellen Modus tatsächlich etwas ändert.
  const activeCount =
    (runsLiveSearch ? (mode !== 'hybrid' ? 1 : 0) + (sortBy !== 'relevance' ? 1 : 0) : 0) +
    (asksModel && depth !== DEFAULT_NOTEBOOK_DEPTH ? 1 : 0) +
    (answerMode !== DEFAULT_NOTEBOOK_ANSWER_MODE ? 1 : 0) +
    (collectionIds ? 1 : 0) +
    keywordFilterCount;

  const handleSubmit = useCallback(
    (submitted: string) => {
      if (composerSubmitAction(answerMode, submitted) === 'search') {
        // Search now, without waiting out the debounce — and keep the text.
        Keyboard.dismiss();
        setQuery(submitted);
        return false;
      }
      router.push(
        routeWithParams('/(focused)/notebook-chat', {
          notebookId,
          initialMessage: submitted,
          ...(notebookTitle && { title: notebookTitle }),
        })
      );
      setText('');
      return undefined;
    },
    [answerMode, router, notebookId, notebookTitle]
  );

  // A system-collection hit reads in the app; a user-notebook document keeps
  // the detail sheet with its source.
  const openHit = useCallback(
    (result: ResearchResult) => {
      if (kind !== 'system' || !result.collection_id || !result.source_url) {
        setSelected(result);
        return;
      }
      router.push(
        routeWithParams('/(focused)/notebook-reader', {
          collectionId: result.collection_id,
          sourceUrl: result.source_url,
          query,
          title: result.title,
        })
      );
    },
    [kind, router, query]
  );

  const resetFilters = () => {
    resetStoreFilters();
    void setAnswerMode(DEFAULT_NOTEBOOK_ANSWER_MODE);
    // Zählen hier in `activeCount`, also muss "Zurücksetzen" sie mitnehmen —
    // obwohl sie als Einstellung das Sheet überlebt.
    if (asksModel) void setDepth(DEFAULT_NOTEBOOK_DEPTH);
    if (runsLiveSearch) {
      setMode('hybrid');
      setSortBy('relevance');
    }
  };

  return (
    <View style={styles.container}>
      {/* The start page's layout: greeting in the middle, hits above, the
          composer docked at the bottom where it rides up with the keyboard. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {notebookTitle && !raised && (
          <CenteredGreeting title={notebookTitle} subtitle="Was möchtest du wissen?" />
        )}

        <View style={styles.body}>
          {showsResults ? (
            <>
              {searchPending && (
                <View style={styles.centerState}>
                  <ActivityIndicator size="large" color={accent} />
                  <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                    Suche läuft…
                  </Text>
                </View>
              )}

              {live.isError && (
                <View style={[styles.errorBox, { backgroundColor: colors.error[500] + '15' }]}>
                  <Ionicons name="alert-circle" size={20} color={colors.error[500]} />
                  <Text style={[styles.errorText, { color: colors.error[500] }]}>
                    Suche fehlgeschlagen. Bitte erneut versuchen.
                  </Text>
                </View>
              )}

              {live.metadata && (
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {live.metadata.totalResults} Ergebnisse in {live.metadata.timeMs} ms
                </Text>
              )}

              {live.results.map((result) => (
                <ResearchResultCard
                  key={`${result.collection_id ?? ''}:${result.document_id}`}
                  result={result}
                  theme={theme}
                  onPress={openHit}
                />
              ))}

              {!searchPending && !live.isError && live.results.length === 0 && (
                <View style={styles.centerState}>
                  <Ionicons name="document-outline" size={44} color={theme.textSecondary} />
                  <Text style={[styles.stateText, { color: theme.textSecondary }]}>
                    Keine Ergebnisse gefunden.
                  </Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>

      <BottomComposerBar
        placeholder={
          answerMode === 'manuell'
            ? 'In diesem Notebook suchen…'
            : `Frag ${notebookTitle ?? 'dieses Notebook'}…`
        }
        onSend={handleSubmit}
        onTextChange={setText}
        submitAs={submitAction === 'search' ? 'search' : 'send'}
        showMentions={false}
        // Depth, sources and categories shape the answer and the search
        // alike, so the sheet is reachable from here in every mode.
        onSettings={() => setFiltersSheetVisible(true)}
        accessory={answerModeAccessory}
        header={
          showsResults ? (
            <View style={styles.composerHeader}>
              <ParsedFilterChips
                chips={chips}
                onDrop={(key) => setDroppedFor({ query, keys: new Set(dropped).add(key) })}
              />
              <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
                {submitAction === 'search'
                  ? 'Treffer kommen direkt aus den Quellen, ohne KI.'
                  : 'Senden stellt die Frage im Notebook-Chat.'}
              </Text>
            </View>
          ) : null
        }
      />

      <BottomSheet
        padded
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
      >
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>
            {asksModel ? (runsLiveSearch ? 'Einstellungen' : 'KI-Antwort') : 'Filter & Sortierung'}
          </Text>
          {activeCount > 0 && (
            <Pressable
              onPress={resetFilters}
              hitSlop={8}
              style={styles.resetButton}
              accessibilityRole="button"
            >
              <Text style={[styles.resetText, { color: accent }]}>Zurücksetzen</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setFiltersSheetVisible(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Filter schließen"
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.sheetScroll}>
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Antwortmodus</Text>
            <View style={styles.filterValues}>
              {NOTEBOOK_COMPOSER_MODES.map((m) => (
                <OptionChip
                  key={m.mode}
                  label={m.label}
                  active={answerMode === m.mode}
                  onPress={() => void setAnswerMode(m.mode)}
                  theme={theme}
                  accent={accent}
                  onAccent={onAccent}
                />
              ))}
            </View>
            <Text style={[styles.filterSectionHint, { color: theme.textSecondary }]}>
              {notebookComposerModeDef(answerMode).description}
            </Text>
          </View>
          {/* Nur wo eine KI-Antwort entstehen kann: die drei Stufen, die Web am
              Notebook-Composer zeigt. Auf die Trefferliste wirken sie nicht. */}
          {asksModel && (
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Suchtiefe</Text>
              <View style={styles.filterValues}>
                {NOTEBOOK_DEPTHS.map((d) => (
                  <OptionChip
                    key={d.depth}
                    label={d.label}
                    active={depth === d.depth}
                    onPress={() => void setDepth(d.depth)}
                    theme={theme}
                    accent={accent}
                    onAccent={onAccent}
                  />
                ))}
              </View>
              {/* "Ultra" says nothing on its own — the chips are one word each. */}
              <Text style={[styles.filterSectionHint, { color: theme.textSecondary }]}>
                {notebookDepthDef(depth).description}
              </Text>
            </View>
          )}

          {/* Only an aggregate notebook has something to pick from. */}
          {availableCollections.length > 1 && (
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Quellen</Text>
              <View style={styles.filterValues}>
                {availableCollections.map((id) => (
                  <OptionChip
                    key={id}
                    label={collectionLabel(id)}
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

          {/* Nur wo Quellen durchsucht werden: beide gehen als `mode`/`sortBy`
              in die Suchanfrage und sagen der KI-Antwort nichts. */}
          {runsLiveSearch && (
            <>
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
            </>
          )}

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
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isActive }}
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
          // The live search re-runs on its own: every option is in its key.
          onPress={() => setFiltersSheetVisible(false)}
          style={[styles.applyButton, { backgroundColor: accent }]}
          accessibilityRole="button"
        >
          <Text style={[styles.applyButtonText, { color: onAccent }]}>
            {activeCount > 0 ? `${activeCount} aktiv · Anwenden` : 'Anwenden'}
          </Text>
        </Pressable>
      </BottomSheet>

      <NotebookAnswerModeSheet
        visible={answerModeSheetVisible}
        onClose={() => setAnswerModeSheetVisible(false)}
        theme={theme}
        withManual
      />

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
  disclaimer: {
    ...typography.caption,
    fontFamily: BODY_FONT,
    marginTop: spacing.xsmall,
    marginHorizontal: spacing.small,
  },
  composerHeader: {
    paddingHorizontal: spacing.xsmall,
    paddingBottom: spacing.xsmall,
  },
  scroll: {
    flex: 1,
  },
  // The greeting fills the empty tab, like the start page's; once it folds
  // away the hits start at the top.
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.medium,
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
  filterSectionHint: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    marginTop: spacing.xxsmall,
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
