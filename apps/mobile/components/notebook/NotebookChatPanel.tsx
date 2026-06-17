import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';

import { getResearchCollectionIds, MOBILE_SYSTEM_NOTEBOOKS } from '../../config/notebooksConfig';
import { useNotebookChatRuntime } from '../../hooks/notebook/useNotebookChatRuntime';
import { useNotebookFilters } from '../../hooks/notebook/useNotebookFilters';
import { colors, spacing, borderRadius } from '../../theme';
import { type ComposerAccessory } from '../chat/AssistantComposer';
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

/** Single-select option pill used inside the sheet (no count). */
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

export function NotebookChatPanel({ notebookId, kind, theme }: Props) {
  const collectionIds = useMemo(() => getResearchCollectionIds(notebookId), [notebookId]);
  // Surface the notebook's own example questions on the chat empty state (mirrors
  // web's startpage chips). Notebooks without a chat config (most Landesverbände)
  // fall back to generic welcome copy with no suggestions.
  const welcome = useMemo(() => {
    const entry = MOBILE_SYSTEM_NOTEBOOKS.find((nb) => nb.id === notebookId);
    return {
      // One centered, notebook-specific question header (Claude-style) — minimal.
      title: entry ? `Was möchtest du von ${entry.title} wissen?` : 'Was möchtest du wissen?',
      suggestions: [] as const,
      ...(entry?.icon ? { icon: entry.icon } : {}),
    };
  }, [notebookId]);
  const { filterFields } = useNotebookFilters(notebookId, kind);
  const keywordFields = filterFields.filter(
    (f) => f.type === 'keyword' && f.values && f.values.length > 0
  );

  const [mode, setMode] = useState<ChatMode>('fast');
  const [keywordFilters, setKeywordFilters] = useState<Record<string, string[]>>({});
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);

  // Feed the thread's KeyboardAvoidingView the screen-Y where this panel starts,
  // so it offsets by the header + segment tabs above it. KeyboardAvoidingView
  // measures relative to its parent and assumes that parent is at the top of the
  // screen — true for the main chat, but here the thread is nested below chrome.
  const containerRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const measureKeyboardOffset = useCallback(() => {
    containerRef.current?.measureInWindow((_x, y) => {
      if (y >= 0) setKeyboardOffset(y);
    });
  }, []);
  const keywordFilterCount = Object.values(keywordFilters).reduce((s, a) => s + a.length, 0);
  const activeCount = (mode !== 'fast' ? 1 : 0) + keywordFilterCount;

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

  const resetSettings = () => {
    setMode('fast');
    setKeywordFilters({});
  };

  // A single filter/mode control in the composer toolbar — replaces the old chip
  // bar, so the conversation gets the full height. Mode (Schnell/Tiefenrecherche)
  // and keyword facets both live behind it.
  const composerAccessory: ComposerAccessory = useMemo(
    () => ({
      icon: 'options-outline',
      onPress: () => setFiltersSheetVisible(true),
      active: activeCount > 0,
      accessibilityLabel: 'Modus und Filter',
    }),
    [activeCount]
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <View ref={containerRef} style={styles.container} onLayout={measureKeyboardOffset}>
        <AssistantThread
          theme={theme}
          welcome={welcome}
          composerAccessory={composerAccessory}
          transparent
          // + a gap so the composer doesn't sit flush against the keyboard.
          keyboardVerticalOffset={keyboardOffset + spacing.large}
        />
      </View>

      <BottomSheet
        padded
        visible={filtersSheetVisible}
        onClose={() => setFiltersSheetVisible(false)}
      >
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Modus & Filter</Text>
          {activeCount > 0 && (
            <Pressable onPress={resetSettings} hitSlop={8} style={styles.resetButton}>
              <Text style={[styles.resetText, { color: theme.textGreen }]}>Zurücksetzen</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setFiltersSheetVisible(false)} hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.sheetScroll}>
          <View style={styles.filterSection}>
            <Text style={[styles.filterSectionTitle, { color: theme.text }]}>Modus</Text>
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
          onPress={() => setFiltersSheetVisible(false)}
          style={[styles.applyButton, { backgroundColor: colors.primary[600] }]}
        >
          <Text style={styles.applyButtonText}>Übernehmen</Text>
        </Pressable>
      </BottomSheet>
    </AssistantRuntimeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
