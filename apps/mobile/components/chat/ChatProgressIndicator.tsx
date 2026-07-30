import { type ChatProgress, type SerializableCitation, usePacedLabel } from '@gruenerator/chat';
import { StyleSheet, Text, View } from 'react-native';

import { chatType, colors, spacing } from '../../theme';
import { type Theme } from '../../theme/colors';

import { GrueneratorLoadingIcon } from './GrueneratorLoadingIcon';
import { selectProgressStep } from './message/progressStepLabel';
import { ShimmerStatusLine } from './ShimmerStatusLine';
import { StatusLineDetails } from './StatusLineDetails';

// Native counterpart of web's streaming progress label (packages/chat
// ProgressIndicator + GrueneratorHomeIconLoading). Pairs the spinning Grünerator
// cog with the cycling, shimmering stage word ("Durchsuche …", "Formuliere …")
// that the shared SSE adapter already writes to `metadata.custom.progress`.

interface ChatProgressIndicatorProps {
  progress: ChatProgress;
  theme: Theme;
  /** The running retrieval step ("Websuche „Klimageld""). Retrieval draws no
   *  card of its own, so this line is where it gets reported. */
  toolStatus?: string | null;
  /** Dropdown content: the model's thinking so far. */
  reasoningText?: string | null;
  /** Dropdown content: what the retrieval steps have found so far. */
  sources?: ReadonlyArray<SerializableCitation>;
}

const NO_SOURCES: ReadonlyArray<SerializableCitation> = [];

export function ChatProgressIndicator({
  progress,
  theme,
  toolStatus,
  reasoningText = null,
  sources = NO_SOURCES,
}: ChatProgressIndicatorProps) {
  // Four sources, most specific first. Planner prose beats the running
  // retrieval step, which beats the agentic loop's own step ("Lese Beschlüsse"),
  // which beats the generic stage word ("Durchsuche …") — that last split is
  // what web puts in a separate ProgressTracker component; here it is one more
  // rung on the same ladder, because the line looks identical either way.
  const step = selectProgressStep(progress.steps);
  const pending = progress.pendingNarration;
  const rawLabel =
    pending && pending.length > 0
      ? pending[pending.length - 1]
      : (toolStatus ?? step?.label ?? progress.message);
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

  return (
    <StatusLineDetails reasoningText={reasoningText} sources={sources} theme={theme}>
      <ShimmerStatusLine label={label} theme={theme} />
    </StatusLineDetails>
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
