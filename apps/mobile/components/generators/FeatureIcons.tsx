import { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';
import { useGeneratorSelectionStore, type AIMode } from '../../stores';
import { ContentPicker } from './ContentPicker';

const AI_MODES: { mode: AIMode; label: string; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { mode: 'kreativ', label: 'Kreativ', icon: 'sparkles-outline', description: 'Mistral Medium' },
  { mode: 'privacy', label: 'Gruenerator-GPT', icon: 'shield-checkmark-outline', description: 'Selbstgehostet' },
  { mode: 'pro', label: 'Reasoning', icon: 'bulb-outline', description: 'Kann nachdenken' },
  { mode: 'ultra', label: 'Ultra', icon: 'rocket-outline', description: 'Führendes Modell' },
];

interface FeatureIconsProps {
  showWebSearch?: boolean;
  showAIMode?: boolean;
  showContent?: boolean;
}

export function FeatureIcons({
  showWebSearch = true,
  showAIMode = true,
  showContent = true,
}: FeatureIconsProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { showActionSheetWithOptions } = useActionSheet();
  const [showContentPicker, setShowContentPicker] = useState(false);

  const useWebSearch = useGeneratorSelectionStore((state) => state.useWebSearch);
  const toggleWebSearch = useGeneratorSelectionStore((state) => state.toggleWebSearch);
  const getCurrentAIMode = useGeneratorSelectionStore((state) => state.getCurrentAIMode);
  const setAIMode = useGeneratorSelectionStore((state) => state.setAIMode);
  const getTotalContentCount = useGeneratorSelectionStore((state) => state.getTotalContentCount);
  const useAutomaticSearch = useGeneratorSelectionStore((state) => state.useAutomaticSearch);

  const currentMode = getCurrentAIMode();
  const contentCount = getTotalContentCount();
  const currentModeConfig = AI_MODES.find((m) => m.mode === currentMode) || AI_MODES[0];
  const hasContent = contentCount > 0 || useAutomaticSearch;

  const handleAIModePress = useCallback(() => {
    const options = AI_MODES.map((m) => `${m.label} – ${m.description}`);
    options.push('Abbrechen');

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: options.length - 1,
        title: 'KI-Modell wählen',
      },
      (selectedIndex) => {
        if (selectedIndex !== undefined && selectedIndex < AI_MODES.length) {
          setAIMode(AI_MODES[selectedIndex].mode);
        }
      }
    );
  }, [showActionSheetWithOptions, setAIMode]);

  return (
    <>
      <View style={styles.container}>
        {showWebSearch && (
          <Pressable
            onPress={toggleWebSearch}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
            hitSlop={8}
          >
            <Ionicons
              name="globe-outline"
              size={20}
              color={useWebSearch ? colors.primary[600] : theme.textSecondary}
            />
          </Pressable>
        )}

        {showAIMode && (
          <Pressable
            onPress={handleAIModePress}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
            hitSlop={8}
          >
            <Ionicons
              name={currentModeConfig.icon}
              size={20}
              color={currentMode !== 'kreativ' ? colors.primary[600] : theme.textSecondary}
            />
          </Pressable>
        )}

        {showContent && (
          <Pressable
            onPress={() => setShowContentPicker(true)}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
            hitSlop={8}
          >
            <Ionicons
              name={useAutomaticSearch ? 'flash-outline' : 'attach-outline'}
              size={20}
              color={hasContent ? colors.primary[600] : theme.textSecondary}
            />
            {contentCount > 0 && (
              <View style={styles.badge}>
                <Ionicons name="ellipse" size={6} color={colors.primary[600]} />
              </View>
            )}
          </Pressable>
        )}
      </View>

      <ContentPicker
        visible={showContentPicker}
        onClose={() => setShowContentPicker(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingBottom: spacing.xsmall,
  },
  iconButton: {
    padding: spacing.xxsmall,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  pressed: {
    opacity: 0.6,
  },
});
