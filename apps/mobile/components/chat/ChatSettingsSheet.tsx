import { Ionicons } from '@expo/vector-icons';
import {
  useAgentStore,
  MODEL_OPTIONS,
  notebookMentionables,
  type ToolKey,
  type ThreadMode,
} from '@gruenerator/chat';
import { memo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Switch,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useShallow } from 'zustand/shallow';

import { BottomSheet } from '../common/BottomSheet';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

const TOOL_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  search: { label: 'Dokumentensuche', icon: 'document-text-outline' },
  web: { label: 'Websuche', icon: 'globe-outline' },
  examples: { label: 'Beispiele', icon: 'bulb-outline' },
  research: { label: 'Recherche', icon: 'flask-outline' },
};

const TOOL_KEYS: ToolKey[] = ['search', 'web', 'examples', 'research'];

const MODE_OPTIONS: Array<{
  mode: ThreadMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { mode: 'chat', label: 'Chat', icon: 'chatbubble-outline' },
  { mode: 'notebook', label: 'Notebook', icon: 'book-outline' },
  { mode: 'eigener', label: 'Eigener Chat', icon: 'settings-outline' },
];

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export const ChatSettingsSheet = memo(function ChatSettingsSheet({ visible, onDismiss }: Props) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { threadMode, enabledTools, selectedModel, selectedNotebookId } = useAgentStore(
    useShallow((s) => ({
      threadMode: s.threadMode,
      enabledTools: s.enabledTools,
      selectedModel: s.selectedModel,
      selectedNotebookId: s.selectedNotebookId,
    }))
  );

  const setThreadMode = useAgentStore((s) => s.setThreadMode);
  const toggleTool = useAgentStore((s) => s.toggleTool);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);

  const notebooks = notebookMentionables;

  const handleModeSelect = useCallback(
    (mode: ThreadMode) => {
      setThreadMode(mode);
    },
    [setThreadMode]
  );

  return (
    <BottomSheet visible={visible} onClose={onDismiss} maxHeight="70%">
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
            {/* Mode */}
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Modus</Text>
            <View style={styles.chipRow}>
              {MODE_OPTIONS.map((opt) => {
                const active = threadMode === opt.mode;
                return (
                  <Pressable
                    key={opt.mode}
                    onPress={() => handleModeSelect(opt.mode)}
                    style={[
                      styles.modeChip,
                      {
                        backgroundColor: active ? colors.primary[600] : theme.surface,
                        borderColor: active ? colors.primary[600] : theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={active ? colors.white : theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeChipText,
                        { color: active ? colors.white : theme.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Notebook selector (only in notebook mode) */}
            {threadMode === 'notebook' && (
              <View style={styles.notebookSection}>
                <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                  Notebook auswählen
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {notebooks.map((nb) => {
                      const active = selectedNotebookId === nb.id;
                      return (
                        <Pressable
                          key={nb.id}
                          onPress={() => setSelectedNotebook(nb.id)}
                          style={[
                            styles.notebookChip,
                            {
                              backgroundColor: active ? colors.primary[600] : theme.surface,
                              borderColor: active ? colors.primary[600] : theme.border,
                            },
                          ]}
                        >
                          <Text style={styles.notebookEmoji}>{nb.emoji}</Text>
                          <Text
                            style={[
                              styles.notebookChipText,
                              { color: active ? colors.white : theme.text },
                            ]}
                            numberOfLines={1}
                          >
                            {nb.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Tools */}
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: spacing.large }]}>
              Werkzeuge
            </Text>
            {TOOL_KEYS.map((key) => {
              const tool = TOOL_LABELS[key];
              return (
                <View
                  key={key}
                  style={[styles.toolRow, { borderBottomColor: theme.border }]}
                >
                  <View style={styles.toolLabel}>
                    <Ionicons name={tool.icon} size={18} color={theme.textSecondary} />
                    <Text style={[styles.toolText, { color: theme.text }]}>{tool.label}</Text>
                  </View>
                  <Switch
                    value={enabledTools[key] !== false}
                    onValueChange={() => toggleTool(key)}
                    trackColor={{ false: theme.border, true: colors.primary[400] }}
                    thumbColor={enabledTools[key] !== false ? colors.primary[600] : theme.surface}
                  />
                </View>
              );
            })}

            {/* Model */}
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: spacing.large }]}>
              Modell
            </Text>
            <View style={styles.chipRow}>
              {MODEL_OPTIONS.map((model) => {
                const active = selectedModel === model.id;
                return (
                  <Pressable
                    key={model.id}
                    onPress={() => setSelectedModel(model.id)}
                    style={[
                      styles.modelChip,
                      {
                        backgroundColor: active ? colors.primary[600] : theme.surface,
                        borderColor: active ? colors.primary[600] : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modelChipText,
                        { color: active ? colors.white : theme.text },
                      ]}
                    >
                      {model.name}
                    </Text>
                    <Text
                      style={[
                        styles.modelChipDesc,
                        { color: active ? colors.primary[200] : theme.textSecondary },
                      ]}
                    >
                      {model.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
      </ScrollView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.medium,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.small,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: spacing.xsmall,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.small,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  notebookSection: {
    marginTop: spacing.small,
  },
  notebookChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  notebookEmoji: {
    fontSize: 14,
  },
  notebookChipText: {
    fontSize: 12,
    fontWeight: '500',
    maxWidth: 120,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  toolText: {
    fontSize: 14,
  },
  modelChip: {
    paddingHorizontal: spacing.small,
    paddingVertical: 8,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: 2,
  },
  modelChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modelChipDesc: {
    fontSize: 11,
  },
});
