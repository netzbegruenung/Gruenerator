import { Keyframe } from 'react-native-reanimated';

// Literal ports of `.status-line-swap` / `.status-line-exit` (packages/chat
// styles/chat.css), kept in one place so the two halves of the status line can't
// drift apart. Layout animations honour the system reduce-motion setting on
// their own, which is what web's `prefers-reduced-motion` block does by hand.

/** Each new (paced) label fades and slides in — keyed on the label, like web. */
export const StatusLineSwap = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 4 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(200);

/** The whole line fades out gracefully instead of vanishing on unmount. */
export const StatusLineExit = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: -4 }] },
}).duration(250);
