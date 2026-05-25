import {
  useAgentStore,
  MODEL_OPTIONS,
  AUTO_MODEL_ID,
  AUTO_MODEL_OPTION,
  notebookMentionables,
  COMPOSER_MODES,
  type ComposerIconKey,
  type ThreadMode,
} from '@gruenerator/chat';
import { isModelEnabledByDefault } from '@gruenerator/shared/models';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useShallow } from 'zustand/shallow';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

// Maps the shared, renderer-agnostic icon keys (COMPOSER_MODES) to Ionicons.
const MODE_ICONS: Record<ComposerIconKey, IoniconsIconName> = {
  chat: 'chatbubble-outline',
  notebook: 'book-outline',
  custom: 'settings-outline',
};

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export const ChatSettingsSheet = memo(function ChatSettingsSheet({ visible, onDismiss }: Props) {
  const theme = useTheme();

  const { threadMode, selectedModel, selectedNotebookId } = useAgentStore(
    useShallow((s) => ({
      threadMode: s.threadMode,
      selectedModel: s.selectedModel,
      selectedNotebookId: s.selectedNotebookId,
    }))
  );

  const setThreadMode = useAgentStore((s) => s.setThreadMode);
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
          {COMPOSER_MODES.map((opt) => {
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
                  name={MODE_ICONS[opt.icon]}
                  size={16}
                  color={active ? colors.white : theme.textSecondary}
                />
                <Text style={[styles.modeChipText, { color: active ? colors.white : theme.text }]}>
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
                  const active = selectedNotebookId === nb.identifier;
                  return (
                    <Pressable
                      key={nb.identifier}
                      onPress={() => setSelectedNotebook(nb.identifier)}
                      style={[
                        styles.notebookChip,
                        {
                          backgroundColor: active ? colors.primary[600] : theme.surface,
                          borderColor: active ? colors.primary[600] : theme.border,
                        },
                      ]}
                    >
                      <Text style={styles.notebookEmoji}>{nb.avatar}</Text>
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

        {/* Model */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: spacing.large }]}>
          Modell
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modelRow}
        >
          {/* Auto — context-aware default, matching web's ModelPicker */}
          <Pressable
            key={AUTO_MODEL_OPTION.id}
            onPress={() => setSelectedModel(AUTO_MODEL_ID)}
            style={[
              styles.modelPill,
              {
                backgroundColor:
                  selectedModel === AUTO_MODEL_ID ? colors.primary[600] : theme.surface,
                borderColor: selectedModel === AUTO_MODEL_ID ? colors.primary[600] : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.modelPillName,
                { color: selectedModel === AUTO_MODEL_ID ? colors.white : theme.text },
              ]}
              numberOfLines={1}
            >
              {AUTO_MODEL_OPTION.name}
            </Text>
          </Pressable>
          {MODEL_OPTIONS.filter((model) => isModelEnabledByDefault(model.id)).map((model) => {
            const active = selectedModel === model.id;
            return (
              <Pressable
                key={model.id}
                onPress={() => setSelectedModel(model.id)}
                style={[
                  styles.modelPill,
                  {
                    backgroundColor: active ? colors.primary[600] : theme.surface,
                    borderColor: active ? colors.primary[600] : theme.border,
                  },
                ]}
              >
                <Text
                  style={[styles.modelPillName, { color: active ? colors.white : theme.text }]}
                  numberOfLines={1}
                >
                  {model.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
  modelRow: {
    flexDirection: 'row',
    gap: spacing.xsmall,
    paddingRight: spacing.medium,
  },
  modelPill: {
    paddingVertical: 8,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  modelPillName: {
    fontSize: 13,
    fontWeight: '600',
  },
});
