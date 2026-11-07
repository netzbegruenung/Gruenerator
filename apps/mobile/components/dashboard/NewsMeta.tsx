import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, useDashboardColors } from '../../theme';

/** Absender und Zeit über einer Schlagzeile: „GRÜNE BAYERN · vor 14 Std.“ (Wissen, Briefing). */
export function NewsMeta({ source, time }: { source: string; time: string }) {
  const c = useDashboardColors();
  const theme = useTheme();
  return (
    <Text style={[styles.source, { color: c.mgInk }]}>
      {source.toUpperCase()}
      {time ? (
        <Text style={[styles.time, { color: theme.textSecondary }]}>{` · ${time}`}</Text>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  source: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  time: { fontWeight: '400', letterSpacing: 0 },
});
