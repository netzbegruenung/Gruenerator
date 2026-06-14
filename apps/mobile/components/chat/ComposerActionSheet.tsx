import {
  useAgentStore,
  MODEL_OPTIONS,
  AUTO_MODEL_ID,
  AUTO_MODEL_OPTION,
  COMPOSER_TOOLS,
  SEARCH_DEPTHS,
  type ComposerToolIconKey,
  type SearchDepthIconKey,
} from '@gruenerator/chat';
import { QWEN_WARNING } from '@gruenerator/shared/models';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { memo, useCallback } from 'react';
import { View, Text, Pressable, Switch, ScrollView, StyleSheet } from 'react-native';
import { useShallow } from 'zustand/shallow';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

// Presentation only: keys/labels come from the shared COMPOSER_TOOLS /
// SEARCH_DEPTHS lists; these map the semantic icon keys → Ionicons names.
const TOOL_ICONS: Record<ComposerToolIconKey, IoniconsIconName> = {
  document: 'document-text-outline',
  globe: 'globe-outline',
  idea: 'bulb-outline',
  newspaper: 'newspaper-outline',
  research: 'flask-outline',
};

const DEPTH_ICONS: Record<SearchDepthIconKey, IoniconsIconName> = {
  fast: 'flash-outline',
  deep: 'telescope-outline',
};

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

  const { enabledTools, selectedModel, searchMode } = useAgentStore(
    useShallow((s) => ({
      enabledTools: s.enabledTools,
      selectedModel: s.selectedModel,
      searchMode: s.searchMode,
    }))
  );

  const toggleTool = useAgentStore((s) => s.toggleTool);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const setSearchMode = useAgentStore((s) => s.setSearchMode);

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
        {COMPOSER_TOOLS.map((tool) => (
          <View key={tool.key} style={[styles.toolRow, { borderBottomColor: theme.border }]}>
            <View style={styles.toolLabel}>
              <Ionicons name={TOOL_ICONS[tool.icon]} size={18} color={theme.textSecondary} />
              <Text style={[styles.toolText, { color: theme.text }]}>{tool.label}</Text>
            </View>
            <Switch
              value={enabledTools[tool.key] !== false}
              onValueChange={() => toggleTool(tool.key)}
              trackColor={{ false: theme.border, true: colors.primary[400] }}
              thumbColor={enabledTools[tool.key] !== false ? colors.primary[600] : theme.surface}
            />
          </View>
        ))}

        {/* Search depth */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: spacing.large }]}>
          Recherchetiefe
        </Text>
        <View style={styles.chipRow}>
          {SEARCH_DEPTHS.map((depth) => {
            const active = searchMode === depth.mode;
            return (
              <Pressable
                key={depth.mode}
                onPress={() => setSearchMode(depth.mode)}
                style={[
                  styles.modelChip,
                  {
                    backgroundColor: active ? colors.primary[600] : theme.surface,
                    borderColor: active ? colors.primary[600] : theme.border,
                  },
                ]}
              >
                <View style={styles.depthHeader}>
                  <Ionicons
                    name={DEPTH_ICONS[depth.icon]}
                    size={14}
                    color={active ? colors.white : theme.textSecondary}
                  />
                  <Text
                    style={[styles.modelChipText, { color: active ? colors.white : theme.text }]}
                  >
                    {depth.label}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.modelChipDesc,
                    { color: active ? colors.primary[200] : theme.textSecondary },
                  ]}
                >
                  {depth.description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Model */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: spacing.large }]}>
          Modell
        </Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setSelectedModel(AUTO_MODEL_ID)}
            style={[
              styles.modelChip,
              {
                backgroundColor:
                  selectedModel === AUTO_MODEL_ID ? colors.primary[600] : theme.surface,
                borderColor: selectedModel === AUTO_MODEL_ID ? colors.primary[600] : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.modelChipText,
                { color: selectedModel === AUTO_MODEL_ID ? colors.white : theme.text },
              ]}
            >
              {AUTO_MODEL_OPTION.name}
            </Text>
            <Text
              style={[
                styles.modelChipDesc,
                {
                  color:
                    selectedModel === AUTO_MODEL_ID ? colors.primary[200] : theme.textSecondary,
                },
              ]}
            >
              {AUTO_MODEL_OPTION.description}
            </Text>
          </Pressable>
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
                {model.region === 'cn' && (
                  <Text
                    style={[
                      styles.modelChipWarningText,
                      { color: active ? colors.white : colors.warning },
                    ]}
                  >
                    {QWEN_WARNING}
                  </Text>
                )}
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
  depthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
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
  modelChipWarningText: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
});
