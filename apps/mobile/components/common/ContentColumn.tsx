import { View } from 'react-native';

import { useContentColumn, type ColumnVariant } from '../../hooks/useLayout';

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Centres its children in a column that stops growing at the cap for `variant`,
 * and pads them off the screen edge by whatever this window's margin is.
 *
 * This is the only place a width cap is written down. Screens ask for `reading`
 * or `grid`; nothing else in the app should know the numbers.
 *
 * On a phone the cap is never reached, so this degrades to exactly the padding
 * the screen had before — which is why it can be dropped into existing layouts
 * without a phone-side diff.
 */
export function ContentColumn({
  variant = 'reading',
  style,
  children,
}: {
  variant?: ColumnVariant;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const column = useContentColumn(variant);

  return <View style={[column, style]}>{children}</View>;
}
