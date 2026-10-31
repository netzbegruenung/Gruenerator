import { type RunActivityView } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BODY_FONT, chatType, spacing } from '../../../theme';

import type { Theme } from '../../../theme/colors';

/**
 * Native twin of web's `RunActivitySummary`: the trace a finished turn keeps
 * once its status line is gone. Whether a turn gets it is the shared
 * `selectRunActivity`'s call; this only draws it, in the same pill as the
 * collapsed tool run (`CollapsedRunRow`).
 */
export function RunActivitySummary({ view, theme }: { view: RunActivityView; theme: Theme }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        style={[styles.row, { backgroundColor: theme.surface }]}
      >
        <Text style={[styles.label, { color: theme.textSecondary }]}>{view.label}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={theme.textSecondary}
        />
      </Pressable>
      {open && (
        <View style={[styles.list, { borderLeftColor: theme.border }]}>
          {view.steps.map((step) => (
            <Text key={step.id} style={[styles.step, { color: theme.textSecondary }]}>
              {step.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: spacing.xxsmall,
  },
  row: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: 999,
  },
  label: {
    ...chatType.chatSecondary,
    fontFamily: BODY_FONT,
  },
  list: {
    marginTop: spacing.xxsmall,
    marginLeft: spacing.xsmall,
    paddingLeft: spacing.small,
    marginBottom: spacing.small,
    borderLeftWidth: 2,
    gap: spacing.xxsmall,
  },
  step: {
    ...chatType.chatSecondary,
  },
});
