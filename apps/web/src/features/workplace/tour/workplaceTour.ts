import { driver, type Driver } from 'driver.js';

import { markWorkplaceTourDone } from './tourState';

import 'driver.js/dist/driver.css';
import './workplaceTour.css';

const SEL = {
  composer: '[data-tour="workplace-composer"]',
  tabs: '[data-tour="workplace-tabs"]',
  arbeitenCreate: '[data-tour="arbeiten-create"]',
  arbeitenRecents: '[data-tour="arbeiten-recents"]',
  arbeitenTools: '[data-tour="arbeiten-tools"]',
  wissen: '[data-tour="wissen"]',
} as const;

// Tab contents are lazy chunks — after a route change the step target may not
// be mounted yet.
function waitForElement(selector: string, timeoutMs = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - startedAt > timeoutMs) return resolve(null);
      setTimeout(poll, 100);
    };
    poll();
  });
}

type NavigateFn = (path: string) => void;

let tourActive = false;

export function startWorkplaceTour(navigate: NavigateFn): void {
  if (tourActive) return;
  tourActive = true;

  const crossTab =
    (path: string, selector: string, move: (drv: Driver) => void) =>
    (_el: Element | undefined, _step: unknown, opts: { driver: Driver }) => {
      navigate(path);
      void waitForElement(selector).then(() => move(opts.driver));
    };

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
    onDestroyed: () => {
      tourActive = false;
    },
    steps: [
      {
        element: SEL.composer,
        popover: {
          title: 'Dein Chat-Einstieg',
          description:
            'Stell Fragen, lass Texte schreiben oder wechsle unten in den Bild-Modus — alles startet hier.',
          side: 'bottom',
        },
      },
      {
        element: SEL.tabs,
        popover: {
          title: 'Drei Bereiche',
          description:
            'Chat, Arbeiten und Wissen — hier oben wechselst du jederzeit zwischen den Bereichen.',
          side: 'bottom',
          onNextClick: crossTab('/workplace/arbeiten', SEL.arbeitenCreate, (drv) => drv.moveNext()),
        },
      },
      {
        element: SEL.arbeitenCreate,
        popover: {
          title: 'Arbeiten: Neues erstellen',
          description:
            'Dokumente, Präsentationen, Tabellen und Sharepics — beschreib einfach, was du brauchst, oder starte mit einer Vorlage.',
          side: 'bottom',
          onPrevClick: crossTab('/workplace', SEL.tabs, (drv) => drv.movePrevious()),
        },
      },
      {
        element: SEL.arbeitenRecents,
        popover: {
          title: 'Zuletzt',
          description:
            'Alle deine Inhalte an einem Ort: Dokumente, Boards, Sharepics, Reels und Texte.',
          side: 'top',
        },
      },
      {
        element: SEL.arbeitenTools,
        popover: {
          title: 'Werkzeuge',
          description: 'Alle Grüneratoren im Überblick — von Pressemitteilung bis Wahlprogramm.',
          side: 'top',
          onNextClick: crossTab('/workplace/wissen', SEL.wissen, (drv) => drv.moveNext()),
        },
      },
      {
        element: SEL.wissen,
        popover: {
          title: 'Wissen',
          description:
            'Notebooks: Sammle Dokumente und Quellen und recherchiere darin mit KI-Unterstützung.',
          onPrevClick: crossTab('/workplace/arbeiten', SEL.arbeitenTools, (drv) =>
            drv.movePrevious()
          ),
        },
      },
    ],
  });

  void waitForElement(SEL.composer).then((el) => {
    if (!el) {
      tourActive = false;
      return;
    }
    // Marked at start (not completion) so an abandoned tour never auto-replays;
    // the manual entry in the account menu stays available.
    markWorkplaceTourDone();
    driverObj.drive();
  });
}
