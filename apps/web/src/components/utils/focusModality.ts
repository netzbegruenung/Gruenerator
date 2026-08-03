/**
 * Input-modality tracking: mirrors "was the last interaction keyboard or
 * pointer?" onto <html data-focus-modality>, so CSS can show focus rings to
 * keyboard users only.
 *
 * Why this exists when :focus-visible already does the same job: the CSS spec
 * makes text-entry fields an exception — an <input>, a <textarea> and a
 * contenteditable match :focus-visible on a plain mouse click too. Every ring
 * on a text field therefore shows up when clicking into it, and no amount of
 * rewriting focus: to focus-visible: changes that. React Aria carries its own
 * useFocusVisible() for exactly this reason; this is the same idea in ~30 lines
 * against one attribute instead of a hook per component.
 *
 * Starts at 'pointer': a fresh page load with no interaction yet is almost
 * always a mouse or touch arrival, and the composer autofocuses itself on
 * desktop — without this the ring would greet everyone on every load. The first
 * keydown flips it, which is early enough: that keypress IS the tab that moves
 * focus.
 */

let current: 'keyboard' | 'pointer' = 'pointer';

const apply = (modality: 'keyboard' | 'pointer'): void => {
  if (modality === current) return;
  current = modality;
  document.documentElement.setAttribute('data-focus-modality', modality);
};

export const trackFocusModality = (): void => {
  document.documentElement.setAttribute('data-focus-modality', current);

  // Capture phase: this must land before any focus handler that reads the
  // attribute during the same interaction.
  document.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      // Cmd/Ctrl/Alt combinations are app switching and shortcuts, not
      // navigation — they must not turn the rings back on behind a mouse user.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      apply('keyboard');
    },
    true
  );

  document.addEventListener('pointerdown', () => apply('pointer'), true);
};
