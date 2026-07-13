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
