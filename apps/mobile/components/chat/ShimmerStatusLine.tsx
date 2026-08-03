import { StyleSheet, View } from 'react-native';

import { chatType, spacing } from '../../theme';

import { GrueneratorLoadingIcon } from './GrueneratorLoadingIcon';
import { ShimmerText } from './ShimmerText';

import type { Theme } from '../../theme/colors';

/**
 * "Something is happening" — the spinning cog plus a shimmering label.
 *
 * The one shape for every waiting state on the chat surface: the streaming stage
 * ("Formuliere Antwort…") and a running tool ("Suche in Dokumenten") are the same
 * event to the reader, and web renders them alike (`ShimmerText` in both
 * `ProgressIndicator` and `ToolCallUI`). Mobile had two looks — a shimmer line
 * for one, a bordered card with a sparkle for the other.
 *
 * chatBody, passed whole: the line stands where the answer will be and is
 * replaced by it, so face, size and leading all have to match or the handover
 * shows as a jump.
 */
export function ShimmerStatusLine({ label, theme }: { label: string; theme: Theme }) {
  return (
    <View style={styles.row}>
      <GrueneratorLoadingIcon size={18} color={theme.textGreen} loading />
      <ShimmerText
        mutedColor={theme.textSecondary}
        brightColor={theme.text}
        fontSize={chatType.chatBody.fontSize}
        style={chatType.chatBody}
      >
        {label}
      </ShimmerText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.xsmall,
  },
});
