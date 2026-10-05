import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { MenuActionSheet } from '../chat/MenuActionSheet';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';

import { buildModerationActions } from './moderationMenu';

interface ModerationMenuButtonProps {
  /** Author name, for the accessibility label. */
  name: string | null;
  canReport: boolean;
  canHide: boolean;
  onReport: () => void;
  onHide: () => void;
  iconSize?: number;
}

/**
 * One quiet "…" per post or comment instead of two visible negative actions.
 * The menu is rendered here, so inside a BottomSheet it stays inside that
 * sheet's children (iOS cannot present a sibling Modal over an open one).
 */
export function ModerationMenuButton({
  name,
  canReport,
  canHide,
  onReport,
  onHide,
  iconSize = 20,
}: ModerationMenuButtonProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const actions = useMemo(() => buildModerationActions(canReport, canHide), [canReport, canHide]);
  if (actions.length === 0) return null;

  const handleSelect = (id: string) => {
    // The menu sheet is still leaving; iOS refuses a second modal in the same tick.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (id === 'report') onReport();
      else if (id === 'hide') onHide();
    }, SHEET_HANDOFF_MS);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={name ? `Weitere Optionen für ${name}` : 'Weitere Optionen'}
        hitSlop={8}
        style={styles.button}
      >
        <Ionicons name="ellipsis-horizontal" size={iconSize} color={theme.textSecondary} />
      </Pressable>
      <MenuActionSheet
        visible={open}
        theme={theme}
        actions={actions}
        onSelect={handleSelect}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
