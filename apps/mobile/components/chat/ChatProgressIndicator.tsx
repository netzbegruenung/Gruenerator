import { type ChatProgress } from '@gruenerator/chat';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../theme';
import { type Theme } from '../../theme/colors';

import { GrueneratorLoadingIcon } from './GrueneratorLoadingIcon';
import { ShimmerText } from './ShimmerText';

// Native counterpart of web's streaming progress label (packages/chat
// ProgressIndicator + GrueneratorHomeIconLoading). Pairs the spinning Grünerator
// cog with the cycling, shimmering stage word ("Durchsuche …", "Formuliere …")
// that the shared SSE adapter already writes to `metadata.custom.progress`.

interface ChatProgressIndicatorProps {
  progress: ChatProgress;
  theme: Theme;
}

export function ChatProgressIndicator({ progress, theme }: ChatProgressIndicatorProps) {
  // Mirror web ProgressIndicator's early return: only the concrete working
  // stages carry a label worth showing. Classify/idle/complete/error and the
  // `direct` intent (no search) fall through to mobile's 3-dot indicator.
  const showsLabel =
    (progress.stage === 'searching' ||
      progress.stage === 'generating' ||
      progress.stage === 'generating_image') &&
    progress.intent !== 'direct' &&
    !!progress.message;

  if (!showsLabel) return null;

  return (
    <View style={styles.row}>
      <GrueneratorLoadingIcon size={18} color={theme.textGreen} loading />
      <ShimmerText mutedColor={theme.textSecondary} brightColor={theme.text}>
        {progress.message}
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
