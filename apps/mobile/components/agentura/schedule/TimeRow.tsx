import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, colors, spacing } from '../../../theme';
import { ListRow } from '../../common';

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function toDate(hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Uhrzeit des Zeitplans. iOS zeigt den kompakten Systemwähler direkt in der
 * Zeile; Android öffnet beim Tippen den Material-Dialog (die Komponente
 * öffnet ihn beim Einhängen, darum nur solange `open`).
 */
export function TimeRow({
  hour,
  minute,
  onChange,
  last,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  last?: boolean;
}) {
  const scheme = useColorScheme();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const value = toDate(hour, minute);

  if (Platform.OS === 'ios') {
    // Eigene Zeile statt ListRow: dessen Pressable würde den Wähler für
    // VoiceOver verschlucken.
    return (
      <View
        style={[
          styles.iosRow,
          !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <Text style={[styles.iosLabel, { color: theme.text }]}>Uhrzeit</Text>
        <DateTimePicker
          mode="time"
          display="compact"
          value={value}
          locale="de_DE"
          accentColor={colors.primary[600]}
          themeVariant={scheme === 'dark' ? 'dark' : 'light'}
          onValueChange={(_, d) => onChange(d.getHours(), d.getMinutes())}
          style={styles.compact}
        />
      </View>
    );
  }

  return (
    <>
      <ListRow
        dense
        title="Uhrzeit"
        value={`${formatTime(hour, minute)} Uhr`}
        onPress={() => setOpen(true)}
        last={last}
      />
      {open ? (
        <DateTimePicker
          mode="time"
          presentation="dialog"
          is24Hour
          value={value}
          accentColor={colors.primary[600]}
          positiveButton={{ label: 'OK' }}
          negativeButton={{ label: 'Abbrechen' }}
          onValueChange={(_, d) => {
            setOpen(false);
            onChange(d.getHours(), d.getMinutes());
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  iosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: 6,
    minHeight: 48,
  },
  iosLabel: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '500',
  },
  compact: { width: 110 },
});
