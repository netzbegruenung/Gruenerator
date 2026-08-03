import {
  selectStatusLineView,
  type ChatProgress,
  type SerializableCitation,
} from '@gruenerator/chat';
import Animated from 'react-native-reanimated';

import { ChatProgressIndicator } from './ChatProgressIndicator';
import { TypingIndicator } from './message/TypingIndicator';
import { StatusLineDetails } from './StatusLineDetails';
import { StatusLineExit } from './statusLineMotion';

import type { Theme } from '../../theme/colors';

/**
 * The single streaming status element above a message body — native twin of
 * web's `StreamingStatusLine`, down to the shared `selectStatusLineView` rule.
 *
 * It is deliberately the ONLY decider. The dots used to come from assistant-ui's
 * `Empty` part slot while the shimmer came from a sibling element, so the two
 * could not see each other: the shimmer's own gates could suppress it for a
 * whole turn and the dots would happily fill the silence, which is exactly what
 * a plain question looked like on mobile.
 */

interface ChatStatusLineProps {
  isStreaming: boolean;
  /** The turn has a tool card or reasoning part of its own. */
  hasOwnDetail: boolean;
  /** Length of the answer text so far — the line retires once it starts. */
  textLength: number;
  progress: ChatProgress | undefined;
  theme: Theme;
  /** The running retrieval step ("Websuche „Klimageld""). */
  toolStatus?: string | null;
  /** Dropdown content: the model's thinking so far. */
  reasoningText?: string | null;
  /** Dropdown content: what the retrieval steps have found so far. */
  sources?: ReadonlyArray<SerializableCitation>;
}

const NO_SOURCES: ReadonlyArray<SerializableCitation> = [];

export function ChatStatusLine({
  isStreaming,
  hasOwnDetail,
  textLength,
  progress,
  theme,
  toolStatus = null,
  reasoningText = null,
  sources = NO_SOURCES,
}: ChatStatusLineProps) {
  const view = selectStatusLineView({
    hasOwnDetail,
    hasText: textLength > 0,
    stage: progress?.stage,
    hasProgress: progress != null,
  });

  if (!isStreaming || view === 'none') return null;

  // Exit only, like web's wrapper div — the entrance belongs to the label swap
  // one level down. Unmounting plays `exiting`, and reanimated keeps the last
  // committed tree on screen while it runs, so the line fades out with its
  // content even though the progress metadata has already cleared. Web needs a
  // ref to pull that off.
  return (
    <Animated.View exiting={StatusLineExit}>
      {view === 'progress' && progress ? (
        <StatusLineDetails reasoningText={reasoningText} sources={sources} theme={theme}>
          <ChatProgressIndicator progress={progress} theme={theme} toolStatus={toolStatus} />
        </StatusLineDetails>
      ) : (
        <TypingIndicator />
      )}
    </Animated.View>
  );
}
