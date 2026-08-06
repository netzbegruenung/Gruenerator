/**
 * Input-modality tracking: mirrors "did the interaction that most recently
 * MOVED FOCUS come from the keyboard or a pointer?" onto <html
 * data-focus-modality>, so CSS can show focus rings to keyboard users only.
 *
 * Why this exists when :focus-visible already does the same job: the CSS spec
 * makes text-entry fields an exception — an <input>, a <textarea> and a
 * contenteditable match :focus-visible on a plain mouse click too. Every ring
 * on a text field therefore shows up when clicking into it, and no amount of
 * rewriting focus: to focus-visible: changes that. React Aria carries its own
 * useFocusVisible() for exactly this reason; this is the same idea in ~30 lines
 * against one attribute instead of a hook per component.
 *
 * The attribute is committed on `focusin`, not on every keydown/pointerdown:
 * typing into an already-focused field fires keydown without changing focus,
 * so committing on keydown flipped the ring on mid-sentence for anyone who had
 * clicked into the field first. Tracking the raw modality separately and only
 * writing it to the DOM when focus actually changes keeps the ring tied to
 * "how did this field get focus", not "was a key pressed recently".
 *
 * Starts at 'pointer': a fresh page load with no interaction yet is almost
 * always a mouse or touch arrival, and the composer autofocuses itself on
 * desktop — without this the ring would greet everyone on every load.
 */

let lastInteraction: 'keyboard' | 'pointer' = 'pointer';

export const trackFocusModality = (): void => {
  document.documentElement.setAttribute('data-focus-modality', lastInteraction);

  // Capture phase: this must land before any focus handler that reads the
  // attribute during the same interaction.
  document.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      // Cmd/Ctrl/Alt combinations are app switching and shortcuts, not
      // navigation — they must not turn the rings back on behind a mouse user.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      lastInteraction = 'keyboard';
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    () => {
      lastInteraction = 'pointer';
    },
    true
  );

  // Commits the modality onto <html> only when focus actually moves, so
  // typing in an already-focused field never touches the attribute.
  document.addEventListener(
    'focusin',
    () => {
      document.documentElement.setAttribute('data-focus-modality', lastInteraction);
    },
    true
  );
};
