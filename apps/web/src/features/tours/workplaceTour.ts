import { type Driver } from 'driver.js';

import useSidebarStore from '../../stores/sidebarStore';

import { runTour, waitForElement } from './runTour';

const SEL = {
  composer: '[data-tour="workplace-composer"]',
  tabs: '[data-tour="workplace-tabs"]',
  arbeitenCreate: '[data-tour="arbeiten-create"]',
  arbeitenTools: '[data-tour="arbeiten-tools"]',
  arbeitenRecents: '[data-tour="arbeiten-recents"]',
  sidebar: '[data-tour="app-sidebar"]',
  sidebarNav: '[data-tour="sidebar-nav"]',
  sidebarChats: '[data-tour="sidebar-chats"]',
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
            'Stell Fragen oder lass Texte schreiben — mit @ holst du Grüneratoren, Notebooks und Dateien ins Feld, im Plus-Menü findest du fertige Vorlagen. Beim Absenden geht es nahtlos im Chat weiter.',
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
            'Dokumente, Boards, Tabellen und Präsentationen — beschreib einfach, was du brauchst, oder starte mit einer Vorlage.',
          side: 'bottom',
          onPrevClick: crossTab('/workplace', SEL.tabs, (drv) => drv.movePrevious()),
        },
      },
      {
        element: SEL.arbeitenTools,
        popover: {
          title: 'Deine Werkzeuge',
          description:
            'Die Kacheln führen in alle Bereiche: Agentura, Office, Studio, Wissen und Projekte — unter „Weitere“ liegen Extras wie Scanner oder Transkription.',
          side: 'top',
        },
      },
      {
        element: SEL.arbeitenRecents,
        popover: {
          title: 'Zuletzt',
          description:
            'Alle deine Inhalte an einem Ort: Dokumente, Tabellen, Präsentationen, Boards, Sharepics, Bilder und Videos.',
          side: 'top',
          onNextClick: (_el, _step, opts) => {
            expandSidebar(() => opts.driver.moveNext());
          },
        },
      },
      {
        element: SEL.sidebarNav,
        popover: {
          title: 'Die Seitenleiste',
          description:
            'Suche (⌘K), deine Grüneratoren und Projekte als Schnellzugriff — und über „Neu“ startest du von überall Chats, Dokumente oder Boards.',
          side: 'right',
          onPrevClick: (_el, _step, opts) => {
            collapseSidebar(() => opts.driver.movePrevious());
          },
        },
      },
      {
        element: SEL.sidebarChats,
        popover: {
          title: 'Deine Chats',
          description:
            'Alle bisherigen Unterhaltungen, von jeder Seite aus erreichbar — und ganz unten dein Konto mit den Einstellungen.',
          side: 'right',
        },
      },
    ],
    { onDestroyed: () => collapseSidebar() }
  );
}
