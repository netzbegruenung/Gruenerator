import { driver, type Config, type DriveStep } from 'driver.js';

import { markTourDone, type TourId } from './tourState';

import 'driver.js/dist/driver.css';
import './tour.css';

// Tour anchors can be inside lazy chunks or CSS-hidden panels — wait until the
// element exists AND has layout before highlighting it.
export function waitForElement(selector: string, timeoutMs = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      const el = document.querySelector(selector);
      if (el && el.getClientRects().length > 0) return resolve(el);
      if (Date.now() - startedAt > timeoutMs) return resolve(null);
      setTimeout(poll, 100);
    };
    poll();
  });
}

let activeTour: TourId | null = null;

const NATIVELY_INTERACTIVE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

// driver.js hängt `aria-haspopup`/`aria-expanded` an das hervorgehobene Element.
// Auf einem <div> ohne Rolle sind beide Attribute unzulässig (axe:
// `aria-allowed-attr`, WCAG 4.1.2) — und ohne Rolle sagen sie einem Screenreader
// ohnehin nichts. Der Popover selbst ist ein `role="dialog"` und bleibt unberührt.
// Nicht nur das eben hervorgehobene Element: driver.js setzt die Attribute je
// nach Schritt auch noch nach dem Callback und räumt sie beim Wechsel nicht
// immer ab. Der Rollen-Test hält echte Bedienelemente heraus.
function dropInvalidPopupHints(): void {
  for (const el of document.querySelectorAll('[aria-haspopup], [aria-expanded]')) {
    if (el.hasAttribute('role') || NATIVELY_INTERACTIVE.has(el.tagName)) continue;
    el.removeAttribute('aria-haspopup');
    el.removeAttribute('aria-expanded');
  }
}

export function runTour(id: TourId, steps: DriveStep[], config?: Config): void {
  if (activeTour) return;
  activeTour = id;

  const driverObj = driver({
    popoverClass: 'gruenerator-tour',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 14,
    showProgress: true,
    progressText: '{{current}} von {{total}}',
    nextBtnText: 'Weiter',
    prevBtnText: 'Zurück',
    doneBtnText: 'Fertig',
    ...config,
    onHighlighted: (el, step, opts) => {
      dropInvalidPopupHints();
      config?.onHighlighted?.(el, step, opts);
    },
    onPopoverRender: (popover, opts) => {
      dropInvalidPopupHints();
      config?.onPopoverRender?.(popover, opts);
    },
    onDestroyed: (el, step, opts) => {
      activeTour = null;
      config?.onDestroyed?.(el, step, opts);
    },
    steps,
  });

  const first = steps[0]?.element;
  const startWait =
    typeof first === 'string' ? waitForElement(first) : Promise.resolve(document.body);
  void startWait.then((el) => {
    if (!el) {
      activeTour = null;
      return;
    }
    markTourDone(id);
    driverObj.drive();
  });
}
