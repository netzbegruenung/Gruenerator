import { type ChatProgress, usePacedLabel } from '@gruenerator/chat';
import { StyleSheet, Text, View } from 'react-native';

import { chatType, colors, spacing } from '../../theme';
import { type Theme } from '../../theme/colors';

import { GrueneratorLoadingIcon } from './GrueneratorLoadingIcon';
import { selectProgressStep } from './message/progressStepLabel';
import { ShimmerStatusLine } from './ShimmerStatusLine';

// Native counterpart of web's streaming progress label (packages/chat
// ProgressIndicator + GrueneratorHomeIconLoading). Pairs the spinning Grünerator
// cog with the cycling, shimmering stage word ("Durchsuche …", "Formuliere …")
// that the shared SSE adapter already writes to `metadata.custom.progress`.

interface ChatProgressIndicatorProps {
  progress: ChatProgress;
  theme: Theme;
}

export function ChatProgressIndicator({ progress, theme }: ChatProgressIndicatorProps) {
  // Three sources, most specific first. The agentic loop's own step ("Lese
  // Beschlüsse") beats the generic stage word ("Durchsuche …") — that is what
  // web splits into a separate ProgressTracker component; here it is one more
  // rung on the same ladder, because the line looks identical either way.
  const step = selectProgressStep(progress.steps);
  const pending = progress.pendingNarration;
  const rawLabel =
    pending && pending.length > 0 ? pending[pending.length - 1] : (step?.label ?? progress.message);
  // Paced (shared usePacedLabel) so a burst stays readable. Hook runs before the
  // early return.
  const label = usePacedLabel(rawLabel);

  // Mirror web ProgressIndicator's early return: only the concrete working
  // stages carry a label worth showing. Classify/idle/complete/error and the
  // `direct` intent (no search) fall through to mobile's 3-dot indicator.
  // A failed step is the exception — it has to be readable whatever the stage
  // says, since the stage may already have moved on.
  const showsLabel =
    step?.failed === true ||
    ((progress.stage === 'searching' ||
      progress.stage === 'generating' ||
      progress.stage === 'generating_image') &&
      progress.intent !== 'direct' &&
      !!label);

  if (!showsLabel || !label) return null;

  if (step?.failed) {
    return (
      <View style={styles.row}>
        <GrueneratorLoadingIcon size={18} color={colors.semantic.error} />
        <Text style={[styles.failed, { color: colors.semantic.error }]}>{label}</Text>
      </View>
    );
  }

  return <ShimmerStatusLine label={label} theme={theme} />;
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
