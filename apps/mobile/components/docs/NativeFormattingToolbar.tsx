import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet, useColorScheme } from 'react-native';

import { lightTheme, darkTheme, colors } from '../../theme';
import {
  useDocsEditorBridgeStore,
  type FormatStyle,
} from '../../stores/docsEditorBridgeStore';

interface ToolbarButton {
  id: string;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  action: () => void;
  isActive: boolean;
}

interface ToolbarDivider {
  id: string;
  divider: true;
}

type ToolbarItem = ToolbarButton | ToolbarDivider;

function isDivider(item: ToolbarItem): item is ToolbarDivider {
  return 'divider' in item;
}

export const NativeFormattingToolbar = memo(function NativeFormattingToolbar() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const activeFormatting = useDocsEditorBridgeStore((s) => s.activeFormatting);
  const canEdit = useDocsEditorBridgeStore((s) => s.canEdit);
  const dispatchAction = useDocsEditorBridgeStore((s) => s.dispatchAction);

  if (!activeFormatting.hasSelection) return null;

  const toggleStyle = (style: FormatStyle) => dispatchAction({ type: 'format', style });
  const setBlockType = (blockType: string, props?: Record<string, unknown>) =>
    dispatchAction({ type: 'setBlockType', blockType, props });
  const setAlignment = (alignment: 'left' | 'center' | 'right') =>
    dispatchAction({ type: 'setAlignment', alignment });

  const { blockType, blockProps } = activeFormatting;
  const alignment = (blockProps?.textAlignment as string) || 'left';
  const headingLevel = blockType === 'heading' ? (blockProps?.level as number) : 0;

  const items: ToolbarItem[] = [
    { id: 'bold', label: 'B', action: () => toggleStyle('bold'), isActive: !!activeFormatting.bold },
    { id: 'italic', label: 'I', action: () => toggleStyle('italic'), isActive: !!activeFormatting.italic },
    { id: 'underline', label: 'U', action: () => toggleStyle('underline'), isActive: !!activeFormatting.underline },
    { id: 'strike', label: 'S', action: () => toggleStyle('strike'), isActive: !!activeFormatting.strike },
    { id: 'd1', divider: true },
    { id: 'h1', label: 'H1', action: () => setBlockType(headingLevel === 1 ? 'paragraph' : 'heading', { level: 1 }), isActive: headingLevel === 1 },
    { id: 'h2', label: 'H2', action: () => setBlockType(headingLevel === 2 ? 'paragraph' : 'heading', { level: 2 }), isActive: headingLevel === 2 },
    { id: 'h3', label: 'H3', action: () => setBlockType(headingLevel === 3 ? 'paragraph' : 'heading', { level: 3 }), isActive: headingLevel === 3 },
    { id: 'd2', divider: true },
    { id: 'bullet', icon: 'list', action: () => setBlockType(blockType === 'bulletListItem' ? 'paragraph' : 'bulletListItem'), isActive: blockType === 'bulletListItem' },
    { id: 'number', icon: 'list-outline', action: () => setBlockType(blockType === 'numberedListItem' ? 'paragraph' : 'numberedListItem'), isActive: blockType === 'numberedListItem' },
    { id: 'check', icon: 'checkbox-outline', action: () => setBlockType(blockType === 'checkListItem' ? 'paragraph' : 'checkListItem'), isActive: blockType === 'checkListItem' },
    { id: 'd3', divider: true },
    { id: 'left', icon: 'menu-outline', action: () => setAlignment('left'), isActive: alignment === 'left' },
    { id: 'center', icon: 'reorder-two-outline', action: () => setAlignment('center'), isActive: alignment === 'center' },
    { id: 'right', icon: 'menu-outline', action: () => setAlignment('right'), isActive: alignment === 'right' },
  ];

  const activeColor = colorScheme === 'dark' ? colors.primary[800] : colors.primary[100];
  const buttonColor = colorScheme === 'dark' ? colors.grey[100] : colors.grey[700];

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => {
          if (isDivider(item)) {
            return (
              <View
                key={item.id}
                style={[styles.divider, { backgroundColor: theme.border }]}
              />
            );
          }

          return (
            <Pressable
              key={item.id}
              onPress={item.action}
              style={[
                styles.button,
                item.isActive && { backgroundColor: activeColor },
              ]}
            >
              {item.icon ? (
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.isActive ? colors.primary[600] : buttonColor}
                />
              ) : (
                <Text
                  style={[
                    styles.buttonLabel,
                    { color: item.isActive ? colors.primary[600] : buttonColor },
                    item.id === 'bold' && { fontWeight: '700' },
                    item.id === 'italic' && { fontStyle: 'italic' },
                    item.id === 'underline' && { textDecorationLine: 'underline' },
                    item.id === 'strike' && { textDecorationLine: 'line-through' },
                  ]}
                >
                  {item.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 2,
    alignItems: 'center',
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    marginHorizontal: 4,
  },
});
