import { Ionicons } from '@expo/vector-icons';
import { useAgentStore, MODEL_OPTIONS, type ToolKey } from '@gruenerator/chat';
import { memo, useCallback } from 'react';
import { View, Text, Pressable, Switch, ScrollView, StyleSheet } from 'react-native';
import { useShallow } from 'zustand/shallow';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

const TOOL_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  search: { label: 'Dokumentensuche', icon: 'document-text-outline' },
  web: { label: 'Websuche', icon: 'globe-outline' },
  examples: { label: 'Beispiele', icon: 'bulb-outline' },
  research: { label: 'Recherche', icon: 'flask-outline' },
};

const TOOL_KEYS: ToolKey[] = ['search', 'web', 'examples', 'research'];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPickFile: () => void;
  onOpenDocBrowser?: () => void;
}

export const ComposerActionSheet = memo(function ComposerActionSheet({
  visible,
  onClose,
  onPickFile,
  onOpenDocBrowser,
}: Props) {
  const theme = useTheme();

  const { enabledTools, selectedModel } = useAgentStore(
    useShallow((s) => ({
      enabledTools: s.enabledTools,
      selectedModel: s.selectedModel,
    }))
  );

  const toggleTool = useAgentStore((s) => s.toggleTool);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);

  const handlePickFile = useCallback(() => {
    onClose();
    onPickFile();
  }, [onClose, onPickFile]);

  const handleOpenDocBrowser = useCallback(() => {
    onClose();
    onOpenDocBrowser?.();
  }, [onClose, onOpenDocBrowser]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="70%">
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={handlePickFile}
            style={({ pressed }) => [
              styles.actionCard,
              { backgroundColor: pressed ? theme.border : theme.surface },
            ]}
          >
            <Ionicons name="attach-outline" size={22} color={colors.primary[600]} />
            <Text style={[styles.actionLabel, { color: theme.text }]}>Datei</Text>
          </Pressable>
          {onOpenDocBrowser && (
            <Pressable
              onPress={handleOpenDocBrowser}
              style={({ pressed }) => [
                styles.actionCard,
                { backgroundColor: pressed ? theme.border : theme.surface },
              ]}
            >
              <Ionicons name="search-outline" size={22} color={colors.primary[600]} />
              <Text style={[styles.actionLabel, { color: theme.text }]}>Dokument</Text>
            </Pressable>
          )}
        </View>

        {/* Tools */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
        {TOOL_KEYS.map((key) => {
          const tool = TOOL_LABELS[key];
          return (
            <View key={key} style={[styles.toolRow, { borderBottomColor: theme.border }]}>
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
                <Text style={[styles.modelChipText, { color: active ? colors.white : theme.text }]}>
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
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.small,
    marginBottom: spacing.large,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.medium,
    borderRadius: borderRadius.large,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.small,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
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
