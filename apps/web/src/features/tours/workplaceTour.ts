import { type Driver } from 'driver.js';

import useSidebarStore from '../../stores/sidebarStore';

import { runTour, waitForElement } from './runTour';

const SEL = {
  composer: '[data-tour="workplace-composer"]',
  tabs: '[data-tour="workplace-tabs"]',
  arbeitenCreate: '[data-tour="arbeiten-create"]',
  arbeitenRecents: '[data-tour="arbeiten-recents"]',
  arbeitenTools: '[data-tour="arbeiten-tools"]',
  studioTools: '[data-tour="studio-tools"]',
  wissen: '[data-tour="wissen"]',
  wissenNotebooks: '[data-tour="wissen-notebooks"]',
  sidebar: '[data-tour="app-sidebar"]',
} as const;

type NavigateFn = (path: string) => void;

const SIDEBAR_EXPAND_REQUESTER = 'workplace-tour';
// Width transition is 200ms; highlight only after it settles so the spotlight
// matches the expanded sidebar.
const SIDEBAR_EXPAND_MS = 300;

function expandSidebar(after: () => void) {
  if (document.querySelector(SEL.sidebar)) {
    useSidebarStore.getState().requestForceExpanded(SIDEBAR_EXPAND_REQUESTER);
    setTimeout(after, SIDEBAR_EXPAND_MS);
  } else {
    after();
  }
}

function collapseSidebar(after?: () => void) {
  useSidebarStore.getState().releaseForceExpanded(SIDEBAR_EXPAND_REQUESTER);
  if (after) setTimeout(after, SIDEBAR_EXPAND_MS);
}

export function startWorkplaceTour(navigate: NavigateFn): void {
  const crossTab =
    (path: string, selector: string, move: (drv: Driver) => void) =>
    (_el: Element | undefined, _step: unknown, opts: { driver: Driver }) => {
      navigate(path);
      void waitForElement(selector).then(() => move(opts.driver));
    };

  runTour(
    'workplace',
    [
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
          title: 'Zwei Bereiche',
          description:
            'Chat und Arbeiten — hier oben wechselst du jederzeit zwischen den Bereichen.',
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
          onNextClick: crossTab('/studio', SEL.studioTools, (drv) => drv.moveNext()),
        },
      },
      {
        element: SEL.studioTools,
        popover: {
          title: 'Bilder & Videos',
          description:
            'KI-Bilder erstellen & bearbeiten, Sharepics gestalten und Reels untertiteln — alle visuellen Werkzeuge an einem Ort.',
          side: 'top',
          onPrevClick: crossTab('/workplace/arbeiten', SEL.arbeitenTools, (drv) =>
            drv.movePrevious()
          ),
          onNextClick: crossTab('/wissen', SEL.wissen, (drv) => drv.moveNext()),
        },
      },
      {
        element: SEL.wissen,
        popover: {
          title: 'Wissen',
          description:
            'Stell Fragen zu grüner Politik — die KI antwortet mit Quellen aus Programmen und Beschlüssen.',
          onPrevClick: crossTab('/studio', SEL.studioTools, (drv) => drv.movePrevious()),
        },
      },
      {
        element: SEL.wissenNotebooks,
        popover: {
          title: 'Notebooks',
          description:
            'Fertige Wissenssammlungen — vom Bundesverband bis zu deinem Landesverband. Oder leg ein eigenes Notebook mit deinen Dokumenten an und recherchiere darin.',
          side: 'top',
          onNextClick: (_el, _step, opts) => {
            expandSidebar(() => opts.driver.moveNext());
          },
        },
      },
      {
        element: SEL.sidebar,
        popover: {
          title: 'Die Seitenleiste',
          description:
            'Von überall erreichbar: Suche (⌘K), Wissen, neue Inhalte anlegen, deine Chats und dein Konto.',
          side: 'right',
          onPrevClick: (_el, _step, opts) => {
            collapseSidebar(() => opts.driver.movePrevious());
          },
        },
      },
    ],
    { onDestroyed: () => collapseSidebar() }
  );
}
