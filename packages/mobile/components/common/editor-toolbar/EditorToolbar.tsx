/**
 * EditorToolbar Component
 * Unified toolbar with expandable panels for editor tools
 */

import { useState, useCallback, type ReactNode } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, lightTheme, darkTheme } from '../../../theme';
import { ToolPill, type ToolType } from './ToolPill';
import { ExpandablePanel } from './ExpandablePanel';

export interface ToolConfig {
  id: ToolType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: number;
  hasPanel?: boolean;
  renderPanel?: () => ReactNode;
  onPress?: () => void;
}

export interface EditorToolbarProps {
  tools: ToolConfig[];
  disabled?: boolean;
  initialActiveTool?: ToolType | null;
  onActiveToolChange?: (toolId: ToolType | null) => void;
}

export function EditorToolbar({
  tools,
  disabled = false,
  initialActiveTool = null,
  onActiveToolChange,
}: EditorToolbarProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  const [activeTool, setActiveTool] = useState<ToolType | null>(initialActiveTool);

  const handleToolPress = useCallback((tool: ToolConfig) => {
    if (tool.onPress && !tool.hasPanel) {
      tool.onPress();
      return;
    }

    const newActiveTool = activeTool === tool.id ? null : tool.id;
    setActiveTool(newActiveTool);
    onActiveToolChange?.(newActiveTool);
  }, [activeTool, onActiveToolChange]);

  const activeToolConfig = tools.find(t => t.id === activeTool && t.hasPanel);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, spacing.small),
        },
      ]}
    >
      <ExpandablePanel isExpanded={!!activeToolConfig}>
        {activeToolConfig?.renderPanel?.()}
      </ExpandablePanel>

      <View style={styles.pillsRow}>
        {tools.map((tool) => (
          <ToolPill
            key={tool.id}
            id={tool.id}
            label={tool.label}
            icon={tool.icon}
            isActive={activeTool === tool.id}
            onPress={() => handleToolPress(tool)}
            badge={tool.badge}
            showChevron={tool.hasPanel !== false}
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
  },
});
