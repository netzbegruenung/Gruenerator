import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import {
  borderRadius,
  darkTheme,
  lightTheme,
  spacing,
  BODY_FONT,
  HEADING_FONT_BOLD,
  HEADING_FONT_SEMIBOLD,
} from '../../theme';
import { type ToolTheme } from '../../theme/toolTheme';

import { BottomSheet } from './BottomSheet';

import type { ReactNode } from 'react';

export interface CreateMenuEntry {
  key: string;
  title: string;
  description: string;
  tone: ToolTheme;
  icon: ReactNode;
  onPress: () => void;
}

/**
 * The FAB's "Neu erstellen" menu: one row per create path, each in its tool's
 * hue. The sheet closes before the entry runs, so an entry that opens a second
 * sheet has to wait for this one to leave (see `SHEET_HANDOFF_MS`).
 */
export function CreateMenuSheet({
  visible,
  onClose,
  entries,
}: {
  visible: boolean;
  onClose: () => void;
  entries: CreateMenuEntry[];
}) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;

  return (
    <BottomSheet visible={visible} onClose={onClose} padded>
      <Text style={[styles.sheetTitle, { color: theme.text }]}>Neu erstellen</Text>
      {entries.map((entry) => (
        <Pressable
          key={entry.key}
          onPress={() => {
            onClose();
            entry.onPress();
          }}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? theme.surface : 'transparent' },
          ]}
          accessibilityRole="button"
        >
          <View style={[styles.rowIcon, { backgroundColor: entry.tone.tile }]}>{entry.icon}</View>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{entry.title}</Text>
            <Text style={[styles.rowDesc, { color: theme.textSecondary }]}>
              {entry.description}
            </Text>
          </View>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

/**
 * How long a second sheet waits after this one closed. Both are RN `Modal`s,
 * and iOS refuses to present one while another is still sliding out (~300 ms).
 */
export const SHEET_HANDOFF_MS = 350;

const styles = StyleSheet.create({
  sheetTitle: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 18,
    paddingBottom: spacing.small,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: HEADING_FONT_SEMIBOLD,
    fontSize: 16,
  },
  rowDesc: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    marginTop: 1,
  },
});
