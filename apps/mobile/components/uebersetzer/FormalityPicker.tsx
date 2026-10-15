import { type TranslationFormality } from '@gruenerator/contracts';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

const OPTIONS: ReadonlyArray<{ value: TranslationFormality; label: string }> = [
  { value: 'default', label: 'Standard' },
  { value: 'more', label: 'Förmlich (Sie)' },
  { value: 'less', label: 'Vertraut (du)' },
];

/** Anrede (DeepL formality) beside the target language, chosen in a small sheet. */
export function FormalityPicker({
  value,
  onChange,
}: {
  value: TranslationFormality;
  onChange: (value: TranslationFormality) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((o) => o.value === value)?.label ?? 'Standard';
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Anrede: ${current}`}
        style={styles.button}
      >
        <Ionicons
          name="person-outline"
          size={18}
          color={value === 'default' ? theme.text : colors.primary[600]}
        />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} padded>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          Anrede
        </Text>
        {OPTIONS.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                setOpen(false);
                onChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? theme.surface : 'transparent' },
              ]}
            >
              <Text style={[styles.rowText, { color: theme.text }, active && styles.active]}>
                {o.label}
              </Text>
              {active ? <Ionicons name="checkmark" size={20} color={colors.primary[600]} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.bodyBold, paddingBottom: spacing.small },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rowText: { ...typography.body },
  active: { fontWeight: '700' },
});
