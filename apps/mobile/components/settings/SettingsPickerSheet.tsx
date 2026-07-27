import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { spacing, BODY_FONT } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';

import { SettingsGroup, SettingsRow } from './SettingsRow';

/**
 * Pick one value from a short list, in the sheet idiom the composer's "+" menu
 * established: a card of rows, a check on the active one.
 *
 * A sheet rather than a pushed screen because these lists are two to four rows
 * long — a full navigation for "Hell / Dunkel / System" costs a transition and a
 * back tap for nothing. Lists that can grow (Konnektoren, Rollen) get a route.
 */

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon: IoniconsIconName;
}

interface Props<T extends string> {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Sits above the options; use it for what the choice affects. */
  hint?: string;
  options: readonly PickerOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

export function SettingsPickerSheet<T extends string>({
  visible,
  onClose,
  title,
  hint,
  options,
  selected,
  onSelect,
}: Props<T>) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} backgroundColor={theme.background}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {hint ? <Text style={[styles.hint, { color: theme.textSecondary }]}>{hint}</Text> : null}
      </View>
      <View style={styles.body}>
        <SettingsGroup>
          {options.map((option, i) => (
            <SettingsRow
              key={option.value}
              icon={option.icon}
              title={option.label}
              value={option.description}
              selected={selected === option.value}
              last={i === options.length - 1}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
            />
          ))}
        </SettingsGroup>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
    gap: 2,
  },
  title: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 20,
  },
  hint: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    paddingHorizontal: spacing.medium,
  },
});
