import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  Modal,
  FlatList,
} from 'react-native';

import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

import type { Theme } from '../../../theme/colors';

// --- Types ---

type SearchMode = 'hybrid' | 'vector' | 'text';
type SortOption = 'relevance' | 'date_desc' | 'date_asc';

interface Collection {
  id: string;
  name: string;
  description: string;
  filterableFields: string[];
}

interface FilterFieldValues {
  field: string;
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
  range?: { min: string; max: string };
}

interface ResearchResult {
  document_id: string;
  title: string;
  source_url: string | null;
  relevant_content: string;
  similarity_score: number;
  chunk_count?: number;
  top_chunks?: Array<{ preview: string; chunk_index: number; page_number: number | null }>;
  collection_id?: string;
  collection_name?: string;
  published_at?: string | null;
}

interface ResearchMetadata {
  totalResults: number;
  collections: string[];
  timeMs: number;
}

// --- Constants ---

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
  region: 'Region',
  landesverband: 'Landesverband',
  gremium: 'Gremium',
  source_type: 'Quelle',
};

const EXAMPLE_QUERIES = [
  { icon: '🌍', text: 'Klimaschutz' },
  { icon: '🚲', text: 'Verkehrswende' },
  { icon: '📚', text: 'Bildungspolitik' },
  { icon: '⚡', text: 'Energiewende' },
];

const COLLECTION_GROUPS: Array<{ label: string; prefixes: string[] }> = [
  { label: 'Bundesebene', prefixes: ['grundsatz', 'bundestagsfraktion', 'gruene-de', 'satzungen'] },
  {
    label: 'Landesebene',
    prefixes: [
      'hamburg',
      'schleswig-holstein',
      'thueringen',
      'bayern',
      'berlin',
      'mecklenburg-vorpommern',
      'brandenburg',
    ],
  },
  {
    label: 'Weitere',
    prefixes: [
      'kommunalwiki',
      'boell-stiftung',
      'gruenblog',
      'oesterreich-gruene',
      'gruene-at',
    ],
  },
];

function groupCollections(collections: Collection[]) {
  const grouped: Array<{ label: string; items: Collection[] }> = [];
  const assigned = new Set<string>();

  for (const group of COLLECTION_GROUPS) {
    const items = collections.filter((c) =>
      group.prefixes.some((p) => c.id.startsWith(p))
    );
    if (items.length > 0) {
      grouped.push({ label: group.label, items });
      items.forEach((c) => assigned.add(c.id));
    }
  }

  const remaining = collections.filter((c) => !assigned.has(c.id));
  if (remaining.length > 0) {
    grouped.push({ label: 'Sonstige', items: remaining });
  }

  return grouped;
}

// --- Filter Chip ---

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
  icon?: keyof typeof Ionicons.glyphMap;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: active ? colors.primary[600] : theme.surface,
          borderColor: active ? colors.primary[600] : theme.border,
        },
      ]}
    >
      {icon && (
        <Ionicons name={icon} size={14} color={active ? colors.white : theme.textSecondary} />
      )}
      <Text
        style={[styles.filterChipText, { color: active ? colors.white : theme.text }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// --- Collection Picker Modal ---

function CollectionPicker({
  visible,
  collections,
  selected,
  onApply,
  onDismiss,
  theme,
}: {
  visible: boolean;
  collections: Collection[];
  selected: string[];
  onApply: (ids: string[]) => void;
  onDismiss: () => void;
  theme: Theme;
}) {
  const [localSelected, setLocalSelected] = useState<string[]>(selected);
  const grouped = useMemo(() => groupCollections(collections), [collections]);
  const allSelected = localSelected.length === 0;

  useEffect(() => {
    if (visible) setLocalSelected(selected);
  }, [visible, selected]);

  const toggleCollection = (id: string) => {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Sammlungen</Text>
            <Pressable onPress={onDismiss} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => setLocalSelected([])}
            style={[styles.allToggle, { borderColor: theme.border }]}
          >
            <Ionicons
              name={allSelected ? 'checkbox' : 'square-outline'}
              size={22}
              color={allSelected ? colors.primary[600] : theme.textSecondary}
            />
            <Text style={[styles.allToggleText, { color: theme.text }]}>
              Alle Sammlungen
            </Text>
          </Pressable>

          <ScrollView style={styles.collectionList}>
            {grouped.map((group) => (
              <View key={group.label} style={styles.collectionGroup}>
                <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>
                  {group.label}
                </Text>
                {group.items.map((c) => {
                  const isSelected = localSelected.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => toggleCollection(c.id)}
                      style={styles.collectionRow}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? colors.primary[600] : theme.textSecondary}
                      />
                      <Text style={[styles.collectionName, { color: theme.text }]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={() => onApply(localSelected)}
            style={[styles.applyButton, { backgroundColor: colors.primary[600] }]}
          >
            <Text style={styles.applyButtonText}>
              {localSelected.length === 0
                ? 'Alle Sammlungen durchsuchen'
                : `${localSelected.length} Sammlung${localSelected.length > 1 ? 'en' : ''} auswählen`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// --- Keyword Filters Modal ---

function KeywordFiltersModal({
  visible,
  filterFields,
  selected,
  onApply,
  onDismiss,
  theme,
}: {
  visible: boolean;
  filterFields: FilterFieldValues[];
  selected: Record<string, string[]>;
  onApply: (filters: Record<string, string[]>) => void;
  onDismiss: () => void;
  theme: Theme;
}) {
  const [local, setLocal] = useState<Record<string, string[]>>(selected);
  const keywordFields = filterFields.filter((f) => f.type === 'keyword' && f.values && f.values.length > 0);

  useEffect(() => {
    if (visible) setLocal(selected);
  }, [visible, selected]);

  const toggleValue = (field: string, value: string) => {
    setLocal((prev) => {
      const current = prev[field] || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length === 0) {
        const { [field]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: updated };
    });
  };

  const activeCount = Object.values(local).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Filter</Text>
            <Pressable onPress={onDismiss} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>

          {keywordFields.length === 0 ? (
            <View style={styles.emptyFilters}>
              <Text style={[styles.emptyFiltersText, { color: theme.textSecondary }]}>
                Keine Filter für die ausgewählten Sammlungen verfügbar
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.collectionList}>
              {keywordFields.map((field) => (
                <View key={field.field} style={styles.filterSection}>
                  <Text style={[styles.filterSectionTitle, { color: theme.text }]}>
                    {KEYWORD_FILTER_LABELS[field.field] || field.label}
                  </Text>
                  <View style={styles.filterValuesRow}>
                    {field.values!.map((v) => {
                      const isActive = (local[field.field] || []).includes(v.value);
                      return (
                        <Pressable
                          key={v.value}
                          onPress={() => toggleValue(field.field, v.value)}
                          style={[
                            styles.filterValueChip,
                            {
                              backgroundColor: isActive ? colors.primary[600] : theme.surface,
                              borderColor: isActive ? colors.primary[600] : theme.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterValueText,
                              { color: isActive ? colors.white : theme.text },
                            ]}
                            numberOfLines={1}
                          >
                            {v.value}
                          </Text>
                          <Text
                            style={[
                              styles.filterValueCount,
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
          )}

          <Pressable
            onPress={() => onApply(local)}
            style={[styles.applyButton, { backgroundColor: colors.primary[600] }]}
          >
            <Text style={styles.applyButtonText}>
              {activeCount > 0 ? `${activeCount} Filter anwenden` : 'Ohne Filter suchen'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// --- Date Range Modal ---

function DateRangeModal({
  visible,
  dateFrom,
  dateTo,
  onApply,
  onDismiss,
  theme,
}: {
  visible: boolean;
  dateFrom: string;
  dateTo: string;
  onApply: (from: string, to: string) => void;
  onDismiss: () => void;
  theme: Theme;
}) {
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);

  useEffect(() => {
    if (visible) {
      setFrom(dateFrom);
      setTo(dateTo);
    }
  }, [visible, dateFrom, dateTo]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <Pressable style={styles.modalOverlay} onPress={onDismiss}>
        <Pressable style={[styles.dateModal, { backgroundColor: theme.background }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Zeitraum</Text>

          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: theme.textSecondary }]}>Von</Text>
            <TextInput
              style={[styles.dateInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="JJJJ-MM-TT"
              placeholderTextColor={theme.textSecondary}
              value={from}
              onChangeText={setFrom}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: theme.textSecondary }]}>Bis</Text>
            <TextInput
              style={[styles.dateInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="JJJJ-MM-TT"
              placeholderTextColor={theme.textSecondary}
              value={to}
              onChangeText={setTo}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <View style={styles.dateActions}>
            <Pressable
              onPress={() => onApply('', '')}
              style={[styles.dateClearButton, { borderColor: theme.border }]}
            >
              <Text style={[styles.dateClearText, { color: theme.textSecondary }]}>Zurücksetzen</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(from, to)}
              style={[styles.dateApplyButton, { backgroundColor: colors.primary[600] }]}
            >
              <Text style={styles.applyButtonText}>Anwenden</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --- Main Screen ---

export default function ResearchScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [metadata, setMetadata] = useState<ResearchMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');
  const [sortOption, setSortOption] = useState<SortOption>('relevance');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [keywordFilters, setKeywordFilters] = useState<Record<string, string[]>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [collections, setCollections] = useState<Collection[]>([]);
  const [filterFields, setFilterFields] = useState<FilterFieldValues[]>([]);

  const [collectionsModalVisible, setCollectionsModalVisible] = useState(false);
  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);

  useEffect(() => {
    getGlobalApiClient()
      .get('/research/collections')
      .then((res) => setCollections(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ids = selectedCollections.length > 0 ? selectedCollections.join(',') : '';
    getGlobalApiClient()
      .get(`/research/filters${ids ? `?collectionIds=${ids}` : ''}`)
      .then((res) => {
        const filtersObj = res.data.filters || {};
        const arr: FilterFieldValues[] = Object.entries(filtersObj).map(
          ([field, entry]: [string, any]) => ({
            field,
            label: entry.label || field,
            type: entry.type || 'keyword',
            values: entry.values,
            range: entry.min || entry.max ? { min: entry.min, max: entry.max } : undefined,
          })
        );
        setFilterFields(arr);
      })
      .catch(() => setFilterFields([]));
  }, [selectedCollections]);

  const hasActiveFilters =
    selectedCollections.length > 0 ||
    searchMode !== 'hybrid' ||
    sortOption !== 'relevance' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    Object.keys(keywordFilters).length > 0;

  const keywordFilterCount = Object.values(keywordFilters).reduce((s, a) => s + a.length, 0);

  // Ref holds latest filter + query state so search() is stable
  const filtersRef = useRef({
    searchMode,
    sortOption,
    selectedCollections,
    keywordFilters,
    dateFrom,
    dateTo,
    query,
  });
  filtersRef.current = {
    searchMode,
    sortOption,
    selectedCollections,
    keywordFilters,
    dateFrom,
    dateTo,
    query,
  };

  const search = useCallback(async (searchQuery?: string) => {
    const f = filtersRef.current;
    const trimmed = (searchQuery ?? f.query).trim();
    if (trimmed.length < 2) return;

    Keyboard.dismiss();
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    const body: Record<string, unknown> = {
      query: trimmed,
      mode: f.searchMode,
      sortBy: f.sortOption,
    };
    if (f.selectedCollections.length > 0) body.collectionIds = f.selectedCollections;

    const filters: Record<string, unknown> = { ...f.keywordFilters };
    if (f.dateFrom) filters.date_from = f.dateFrom;
    if (f.dateTo) filters.date_to = f.dateTo;
    if (Object.keys(filters).length > 0) body.filters = filters;

    try {
      const apiClient = getGlobalApiClient();
      const response = await apiClient.post('/research/search', body);
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

  const searchIfActive = useCallback(() => {
    if (hasSearched) search();
  }, [hasSearched, search]);

  const handleSearch = useCallback(() => search(), [search]);

  const handleExamplePress = useCallback(
    (text: string) => {
      setQuery(text);
      search(text);
    },
    [search]
  );

  const resetFilters = useCallback(() => {
    setSearchMode('hybrid');
    setSortOption('relevance');
    setSelectedCollections([]);
    setKeywordFilters({});
    setDateFrom('');
    setDateTo('');
  }, []);

  const cycleMode = useCallback(() => {
    setSearchMode((prev) => {
      const next = MODE_CYCLE[(MODE_CYCLE.indexOf(prev) + 1) % MODE_CYCLE.length];
      // Update ref immediately so searchIfActive reads the new value
      filtersRef.current.searchMode = next;
      return next;
    });
    searchIfActive();
  }, [searchIfActive]);

  const cycleSort = useCallback(() => {
    setSortOption((prev) => {
      const next = SORT_CYCLE[(SORT_CYCLE.indexOf(prev) + 1) % SORT_CYCLE.length];
      filtersRef.current.sortOption = next;
      return next;
    });
    searchIfActive();
  }, [searchIfActive]);

  const scorePercent = (score: number) => `${Math.round(score * 100)}%`;

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Bar */}
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

        {/* Filter Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
        >
          <FilterChip
            label={
              selectedCollections.length > 0
                ? `Sammlungen (${selectedCollections.length})`
                : 'Sammlungen'
            }
            active={selectedCollections.length > 0}
            onPress={() => setCollectionsModalVisible(true)}
            icon="library-outline"
            theme={theme}
          />
          <FilterChip
            label={MODE_LABELS[searchMode]}
            active={searchMode !== 'hybrid'}
            onPress={cycleMode}
            icon="options-outline"
            theme={theme}
          />
          <FilterChip
            label={SORT_LABELS[sortOption]}
            active={sortOption !== 'relevance'}
            onPress={cycleSort}
            icon="swap-vertical-outline"
            theme={theme}
          />
          <FilterChip
            label={dateFrom || dateTo ? `Datum ✓` : 'Datum'}
            active={dateFrom !== '' || dateTo !== ''}
            onPress={() => setDateModalVisible(true)}
            icon="calendar-outline"
            theme={theme}
          />
          <FilterChip
            label={keywordFilterCount > 0 ? `Filter (${keywordFilterCount})` : 'Filter'}
            active={keywordFilterCount > 0}
            onPress={() => setFiltersModalVisible(true)}
            icon="funnel-outline"
            theme={theme}
          />
          {hasActiveFilters && (
            <FilterChip
              label="Reset"
              active={false}
              onPress={resetFilters}
              icon="refresh-outline"
              theme={theme}
            />
          )}
        </ScrollView>

        {/* Examples */}
        {!hasSearched && !isLoading && (
          <View style={styles.examplesSection}>
            <Text style={[styles.examplesLabel, { color: theme.textSecondary }]}>
              Beispielsuchen
            </Text>
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

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Suche läuft...</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.error[500] + '15' }]}>
            <Ionicons name="alert-circle" size={20} color={colors.error[500]} />
            <Text style={[styles.errorText, { color: colors.error[500] }]}>{error}</Text>
          </View>
        )}

        {/* Metadata */}
        {metadata && !isLoading && (
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>
            {metadata.totalResults} Ergebnisse in {metadata.timeMs} ms
          </Text>
        )}

        {/* Results */}
        {results.map((result) => (
          <Pressable
            key={result.document_id}
            onPress={() => result.source_url && Linking.openURL(result.source_url)}
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

            <View style={styles.resultMetaRow}>
              {result.collection_name && (
                <View style={[styles.collectionBadge, { backgroundColor: theme.surface }]}>
                  <Ionicons name="library-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.collectionText, { color: theme.textSecondary }]}>
                    {result.collection_name}
                  </Text>
                </View>
              )}
              {result.published_at && (
                <View style={[styles.collectionBadge, { backgroundColor: theme.surface }]}>
                  <Ionicons name="calendar-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.collectionText, { color: theme.textSecondary }]}>
                    {formatDate(result.published_at)}
                  </Text>
                </View>
              )}
              {result.chunk_count != null && result.chunk_count > 1 && (
                <View style={[styles.collectionBadge, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.collectionText, { color: theme.textSecondary }]}>
                    {result.chunk_count} Abschnitte
                  </Text>
                </View>
              )}
            </View>

            <Text
              style={[styles.resultContent, { color: theme.textSecondary }]}
              numberOfLines={4}
            >
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

        {/* Empty State */}
        {hasSearched && !isLoading && results.length === 0 && !error && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Keine Ergebnisse gefunden
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <CollectionPicker
        visible={collectionsModalVisible}
        collections={collections}
        selected={selectedCollections}
        onApply={(ids) => {
          setSelectedCollections(ids);
          filtersRef.current.selectedCollections = ids;
          setCollectionsModalVisible(false);
          searchIfActive();
        }}
        onDismiss={() => setCollectionsModalVisible(false)}
        theme={theme}
      />
      <KeywordFiltersModal
        visible={filtersModalVisible}
        filterFields={filterFields}
        selected={keywordFilters}
        onApply={(f) => {
          setKeywordFilters(f);
          filtersRef.current.keywordFilters = f;
          setFiltersModalVisible(false);
          searchIfActive();
        }}
        onDismiss={() => setFiltersModalVisible(false)}
        theme={theme}
      />
      <DateRangeModal
        visible={dateModalVisible}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onApply={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
          filtersRef.current.dateFrom = from;
          filtersRef.current.dateTo = to;
          setDateModalVisible(false);
          searchIfActive();
        }}
        onDismiss={() => setDateModalVisible(false)}
        theme={theme}
      />
    </View>
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
  filterBar: {
    gap: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  examplesSection: {
    gap: spacing.small,
    marginTop: spacing.small,
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
  resultMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  collectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: borderRadius.xlarge,
    borderTopRightRadius: borderRadius.xlarge,
    paddingTop: spacing.medium,
    paddingBottom: spacing.xlarge,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    marginBottom: spacing.medium,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  allToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  allToggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  collectionList: {
    paddingHorizontal: spacing.medium,
  },
  collectionGroup: {
    marginTop: spacing.medium,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xsmall,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: 10,
  },
  collectionName: {
    fontSize: 15,
    flex: 1,
  },
  applyButton: {
    marginHorizontal: spacing.medium,
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
  emptyFilters: {
    padding: spacing.xlarge,
    alignItems: 'center',
  },
  emptyFiltersText: {
    ...typography.body,
    textAlign: 'center',
  },
  filterSection: {
    marginTop: spacing.medium,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xsmall,
  },
  filterValuesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  filterValueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterValueText: {
    fontSize: 13,
  },
  filterValueCount: {
    fontSize: 11,
  },
  dateModal: {
    marginHorizontal: spacing.medium,
    borderRadius: borderRadius.xlarge,
    padding: spacing.medium,
    gap: spacing.medium,
  },
  dateRow: {
    gap: spacing.xxsmall,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  dateInput: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    fontSize: 15,
  },
  dateActions: {
    flexDirection: 'row',
    gap: spacing.small,
  },
  dateClearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    alignItems: 'center',
  },
  dateClearText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateApplyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.large,
    alignItems: 'center',
  },
});
