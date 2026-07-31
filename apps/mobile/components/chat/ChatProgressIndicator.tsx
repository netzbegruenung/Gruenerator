import { type ChatProgress, selectStatusLabel, usePacedLabel } from '@gruenerator/chat';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { chatType, colors, spacing } from '../../theme';
import { type Theme } from '../../theme/colors';

import { GrueneratorLoadingIcon } from './GrueneratorLoadingIcon';
import { ShimmerStatusLine } from './ShimmerStatusLine';
import { StatusLineSwap } from './statusLineMotion';

// Native counterpart of web's ProgressTracker: turns the turn's progress into
// ONE sentence and shimmers it. Which element the message shows at all (this
// line / the typing dots / nothing) is not decided here but one level up, in
// ChatStatusLine — the same split web makes with StreamingStatusLine.

interface ChatProgressIndicatorProps {
  progress: ChatProgress;
  theme: Theme;
  /** The running retrieval step ("Websuche „Klimageld""). Retrieval draws no
   *  card of its own, so this line is where it gets reported. */
  toolStatus?: string | null;
}

export function ChatProgressIndicator({ progress, theme, toolStatus }: ChatProgressIndicatorProps) {
  // Precedence (failed step → planner prose → retrieval step → stage word) is
  // the shared `selectStatusLabel`, the same one ProgressTracker calls. Paced so
  // a burst stays readable; the hook runs before any early return.
  const status = selectStatusLabel({
    steps: progress.steps,
    pendingNarration: progress.pendingNarration,
    toolStatus,
    message: progress.message,
  });
  const label = usePacedLabel(status?.label ?? '');

  if (!status || !label) return null;

  if (status.failed) {
    return (
      <View style={styles.row}>
        <GrueneratorLoadingIcon size={18} color={colors.semantic.error} />
        <Text style={[styles.failed, { color: colors.semantic.error }]}>{status.label}</Text>
      </View>
    );
  }

  // Keyed on the paced value → each swap replays the 0.2s crossfade, exactly as
  // web keys its `status-line-swap` span.
  return (
    <Animated.View key={label} entering={StatusLineSwap}>
      <ShimmerStatusLine label={label} theme={theme} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.xsmall,
  },
  // Not shimmering: the shimmer reads as "still working", which a failed step
  // is not. Same tier as the running label so the line does not jump — and via
  // chatType, so it cannot lose PT Sans the way a bare fontSize does.
  failed: {
    ...chatType.chatBody,
    fontWeight: '600',
  },
});
