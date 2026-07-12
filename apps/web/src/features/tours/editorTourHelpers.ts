import { type DriverHook } from 'driver.js';

import { waitForElement } from './runTour';

// Docs/sheets/presentations mount their AI chat panel lazily behind a top-bar
// toggle. This next-handler opens the panel (if needed) and advances once it
// has layout.
export function openChatThenNext(toggleSelector: string, panelSelector: string): DriverHook {
  return (_el, _step, opts) => {
    const panel = document.querySelector(panelSelector);
    const isVisible = panel ? panel.getClientRects().length > 0 : false;
    if (!isVisible) {
      document.querySelector<HTMLElement>(toggleSelector)?.click();
    }
    void waitForElement(panelSelector).then(() => opts.driver.moveNext());
  };
}
