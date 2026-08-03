import { type MenuAction } from '@expo/ui/community/menu';
import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing, borderRadius, chatType } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

import type { Theme } from '../../theme/colors';

/**
 * A `MenuAction[]` rendered as a sheet.
 *
 * The action lists in `menuActions.ts` stay exactly as they are — labels, order,
 * the destructive flag and the disabled state are decided once and covered by
 * `menuActions.vitest.ts`. Only the surface is ours.
 *
 * Why not `MenuView`, which those lists were written for: wrapped around a
 * drawer row it rendered to NOTHING on the device — every conversation vanished
 * from the list, with no error in the Metro log and none in logcat. Whether a
 * fresh native build fixes that is untested; a sheet is the surface that
 * demonstrably arrives, on new binaries and old ones alike.
 *
 * `MenuAction` is kept as the input type on purpose: if the native menu turns
 * out to work after a rebuild, swapping this back is a change of component, not
 * of data.
 */
export const MenuActionSheet = memo(function MenuActionSheet({
  visible,
  theme,
  heading,
  actions,
  onSelect,
  onClose,
}: {
  visible: boolean;
  theme: Theme;
  /** What the menu is acting on — a conversation's name, say. */
  heading?: string;
  actions: MenuAction[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} padded>
      {heading ? (
        <Text style={[styles.heading, { color: theme.textSecondary }]} numberOfLines={1}>
          {heading}
        </Text>
      ) : null}
      {actions
        .filter((action) => action.attributes?.hidden !== true)
        .map((action) => {
          const destructive = action.attributes?.destructive === true;
          const disabled = action.attributes?.disabled === true;
          return (
            <Pressable
              key={action.id ?? action.title}
              disabled={disabled}
              onPress={() => {
                onClose();
                onSelect(action.id ?? action.title);
              }}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              accessibilityState={{ disabled }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? theme.surface : 'transparent' },
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.rowLabel,
                  { color: destructive ? colors.semantic.error : theme.text },
                ]}
              >
                {action.title}
              </Text>
            </Pressable>
          );
        })}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  heading: {
    ...chatType.chatLabel,
    fontWeight: '700',
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.xsmall,
  },
  row: {
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.medium,
  },
  disabled: {
    opacity: 0.4,
  },
  rowLabel: {
    ...chatType.chatBody,
  },
});
