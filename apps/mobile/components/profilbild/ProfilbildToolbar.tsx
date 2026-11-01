import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

export type ProfilbildTool = 'hintergrund' | 'sticker' | 'foto';

const TOOLS: { id: ProfilbildTool; label: string; icon: IoniconsIconName }[] = [
  { id: 'hintergrund', label: 'Hintergrund', icon: 'color-palette-outline' },
  { id: 'sticker', label: 'Sticker', icon: 'happy-outline' },
  { id: 'foto', label: 'Foto', icon: 'image-outline' },
];

/** The editor's tools, always at the bottom; each opens its sheet. */
export function ProfilbildToolbar({
  active,
  disabled,
  onOpen,
}: {
  active: ProfilbildTool | null;
  /** Tools that need a photo first. */
  disabled: ProfilbildTool[];
  onOpen(tool: ProfilbildTool): void;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="toolbar"
      style={[styles.bar, { borderTopColor: theme.border, backgroundColor: theme.background }]}
    >
      {TOOLS.map((tool) => {
        const off = disabled.includes(tool.id);
        const on = active === tool.id;
        return (
          <Pressable
            key={tool.id}
            accessibilityRole="button"
            // Named explicitly: otherwise the icon's glyph text joins the name.
            accessibilityLabel={tool.label}
            accessibilityState={{ disabled: off, expanded: on }}
            disabled={off}
            onPress={() => onOpen(tool.id)}
            style={[styles.tool, off && styles.off]}
          >
            <View
              style={[styles.icon, { backgroundColor: on ? colors.primary[600] : theme.surface }]}
            >
              <Ionicons name={tool.icon} size={22} color={on ? colors.white : theme.text} />
            </View>
            <Text style={[styles.label, { color: on ? colors.primary[600] : theme.text }]}>
              {tool.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One tool's sheet: a titled, scrolling panel low enough to keep the stage in view. */
export function ToolSheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} padded maxHeight="50%">
      <View style={styles.sheetHeader}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
          <Text style={[styles.done, { color: colors.primary[600] }]}>Fertig</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.sheetBody}
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tool: { alignItems: 'center', gap: spacing.xxsmall, minWidth: 88, minHeight: 44 },
  off: { opacity: 0.35 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.caption, fontWeight: '600' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.small,
  },
  title: { ...typography.bodyBold },
  done: { ...typography.body, fontWeight: '600' },
  sheetBody: { flexShrink: 1 },
  sheetContent: { gap: spacing.medium, paddingBottom: spacing.small },
});
