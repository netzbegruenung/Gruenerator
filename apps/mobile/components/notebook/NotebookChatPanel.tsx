import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';

import { getNotebookConfigByNotebookId, getResearchCollectionIds } from '../../config/notebooksConfig';
import { useNotebookChatRuntime } from '../../hooks/notebook/useNotebookChatRuntime';
import { useNotebookFilters } from '../../hooks/notebook/useNotebookFilters';
import { colors, spacing, borderRadius } from '../../theme';
import { AssistantThread } from '../chat/AssistantThread';
import { BottomSheet } from '../common/BottomSheet';

import type { Theme } from '../../theme/colors';
import type { NotebookAdapterConfig } from '@gruenerator/chat';

interface Props {
  notebookId: string;
  kind: 'system' | 'user';
  theme: Theme;
}

type ChatMode = 'fast' | 'deep';
const MODE_LABELS: Record<ChatMode, string> = { fast: 'Schnell', deep: 'Tiefenrecherche' };
const MODE_CYCLE: ChatMode[] = ['fast', 'deep'];

const KEYWORD_FILTER_LABELS: Record<string, string> = {
  content_type: 'Inhaltstyp',
  primary_category: 'Kategorie',
  subcategories: 'Unterkategorien',
  country: 'Land',
  source_type: 'Organ',
};

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

export function NotebookChatPanel({ notebookId, kind, theme }: Props) {
  const collectionIds = useMemo(() => getResearchCollectionIds(notebookId), [notebookId]);
  // Surface the notebook's own example questions on the chat empty state (mirrors
  // web's startpage chips). Notebooks without a chat config (most Landesverbände)
  // fall back to generic welcome copy with no suggestions.
  const welcome = useMemo(() => {
    const config = getNotebookConfigByNotebookId(notebookId);
    return {
      title: config?.title ?? 'Frag dieses Notebook',
      subtitle:
        config?.placeholder ?? 'Stelle eine Frage zu den Dokumenten dieses Notebooks.',
      suggestions: config?.exampleQuestions.map((q) => q.text) ?? [],
    };
  }, [notebookId]);
  const { filterFields } = useNotebookFilters(notebookId, kind);
  const keywordFields = filterFields.filter(
    (f) => f.type === 'keyword' && f.values && f.values.length > 0
  );
  const showFilterChip = kind === 'system' && keywordFields.length > 0;

  const [mode, setMode] = useState<ChatMode>('fast');
  const [keywordFilters, setKeywordFilters] = useState<Record<string, string[]>>({});
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const { showActionSheetWithOptions } = useActionSheet();
  const keywordFilterCount = Object.values(keywordFilters).reduce((s, a) => s + a.length, 0);

  // Refs keep getConfig referentially stable so the adapter/runtime is created
  // once; the notebook chat reads fresh filters/mode on the NEXT message.
  const collectionIdsRef = useRef(collectionIds);
  collectionIdsRef.current = collectionIds;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const filtersRef = useRef(keywordFilters);
  filtersRef.current = keywordFilters;
  const threadIdRef = useRef<string | null>(null);

  const getConfig = useCallback(
    (): NotebookAdapterConfig => ({
      collectionIds: collectionIdsRef.current,
      mode: modeRef.current,
      ...(Object.keys(filtersRef.current).length > 0 ? { filters: filtersRef.current } : {}),
      ...(threadIdRef.current ? { threadId: threadIdRef.current } : {}),
    }),
    []
  );
  const onThreadCreated = useCallback((tid: string) => {
    threadIdRef.current = tid;
  }, []);
  const runtime = useNotebookChatRuntime(getConfig, onThreadCreated);

  const pickMode = () => {
    const labels = MODE_CYCLE.map((m) => MODE_LABELS[m]);
    showActionSheetWithOptions(
      { title: 'Modus', options: [...labels, 'Abbrechen'], cancelButtonIndex: labels.length },
      (i) => {
        if (i == null || i >= labels.length) return;
        setMode(MODE_CYCLE[i]);
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipBarScroll}
          contentContainerStyle={styles.chipBar}
        >
          <FilterChip
            label={MODE_LABELS[mode]}
            active={mode !== 'fast'}
            onPress={pickMode}
            icon="flash-outline"
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

        <AssistantThread theme={theme} welcome={welcome} />
      </View>

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
            onPress={() => setFiltersSheetVisible(false)}
            style={[styles.applyButton, { backgroundColor: colors.primary[600] }]}
          >
            <Text style={styles.applyButtonText}>
              {keywordFilterCount > 0 ? `${keywordFilterCount} Filter aktiv` : 'Schließen'}
            </Text>
          </Pressable>
        </BottomSheet>
      )}
    </AssistantRuntimeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
