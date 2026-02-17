import { View, Text, StyleSheet } from 'react-native';
import { Bubble, type BubbleProps } from 'react-native-gifted-chat';

import { colors, spacing, borderRadius } from '../../theme';

import type { lightTheme, darkTheme } from '../../theme/colors';

interface Props {
  props: BubbleProps;
  theme: typeof lightTheme | typeof darkTheme;
  isStreamingMessage?: boolean;
}

export function StreamingBubble({ props, theme, isStreamingMessage }: Props) {
  return (
    <View>
      <Bubble
        {...props}
        wrapperStyle={{
          right: {
            backgroundColor: colors.primary[600],
            borderRadius: borderRadius.large,
            marginVertical: spacing.xxsmall,
          },
          left: {
            backgroundColor: theme.surface,
            borderRadius: borderRadius.large,
            marginVertical: spacing.xxsmall,
          },
        }}
        textStyle={{
          right: { color: colors.white },
          left: { color: theme.text },
        }}
      />
      {isStreamingMessage && (
        <View style={styles.cursorContainer}>
          <Text style={[styles.cursor, { color: colors.primary[600] }]}>▊</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cursorContainer: {
    position: 'absolute',
    bottom: spacing.small,
    left: spacing.medium + borderRadius.large,
  },
  cursor: {
    fontSize: 14,
    opacity: 0.7,
  },
});
