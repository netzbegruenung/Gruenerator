import { BranchPickerPrimitive, useAuiState } from '@assistant-ui/react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { spacing, BODY_FONT } from '../../../theme';

import type { Theme } from '../../../theme/colors';

/**
 * Branch navigation for a message that exists in more than one version — which
 * only happens once someone edits a message or regenerates an answer. There is
 * no primitive for the visibility rule, so the count check lives here.
 */
export const BranchPicker = memo(function BranchPicker({ theme }: { theme: Theme }) {
  const branchCount = useAuiState((s) => s.message.branchCount);
  if (branchCount <= 1) return null;

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <BranchPickerPrimitive.Previous style={styles.button}>
        <Ionicons name="chevron-back" size={14} color={theme.textSecondary} />
      </BranchPickerPrimitive.Previous>
      <View style={styles.label}>
        <BranchPickerPrimitive.Number style={[styles.text, { color: theme.textSecondary }]} />
        <Text style={[styles.text, { color: theme.textSecondary }]}>/</Text>
        <BranchPickerPrimitive.Count style={[styles.text, { color: theme.textSecondary }]} />
      </View>
      <BranchPickerPrimitive.Next style={styles.button}>
        <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
      </BranchPickerPrimitive.Next>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxsmall,
  },
  button: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '500',
  },
});
