import { StyleSheet } from 'react-native';

import { spacing } from '../../../theme';

/**
 * The outer frame both message roles share.
 *
 * Vertical rhythm follows ChatGPT's: a message is separated from its
 * neighbours by more than the gap between a message and its own action row, so
 * a turn reads as one block rather than as evenly spaced lines.
 */
export const messageLayout = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.medium,
    marginVertical: spacing.small,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
    marginTop: spacing.small,
  },
  assistantContent: {
    width: '100%',
  },
});
