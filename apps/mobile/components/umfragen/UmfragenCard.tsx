import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useDashboardColors } from '../../theme';

/** Weiße (dunkel: anthrazit) Karte mit dem Innenmaß der Web-Karten in Handybreite (20/22). */
export function UmfragenCard({
  children,
  ...rest
}: Pick<ViewProps, 'accessibilityLabel' | 'aria-busy' | 'testID'> & { children: ReactNode }) {
  const c = useDashboardColors();
  return (
    <View {...rest} style={[styles.card, { backgroundColor: c.card }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
});
