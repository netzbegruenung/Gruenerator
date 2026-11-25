/**
 * Scrolls the preview to a block, e.g. one just added from the sidebar or picked in its list.
 * The block lives in the preview iframe and may render a frame or two after the draft changed,
 * so this looks for it over a few animation frames before giving up.
 */
export function revealBlock(blockId: string, attempts = 10): void {
  const selector = `[data-block-id="${CSS.escape(blockId)}"]`;
  const find = (): Element | null => {
    for (const frame of document.querySelectorAll('iframe')) {
      const found = frame.contentDocument?.querySelector(selector);
      if (found) return found;
    }
    return null;
  };
  const tick = (left: number) => {
    const block = find();
    if (block) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      block.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    if (left > 0) requestAnimationFrame(() => tick(left - 1));
  };
  tick(attempts);
}
