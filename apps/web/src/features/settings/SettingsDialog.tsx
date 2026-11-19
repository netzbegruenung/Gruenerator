import {
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  useIsMobile,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect, useRef, useState } from 'react';
import { type IconType } from 'react-icons';
import {
  FiBarChart2,
  FiBell,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiCloud,
  FiGlobe,
  FiHelpCircle,
  FiSearch,
  FiServer,
  FiSettings,
  FiShield,
  FiSliders,
  FiUser,
  FiX,
} from 'react-icons/fi';
import {
  PiBrain,
  PiEnvelopeSimple,
  PiPaintBrushBroad,
  PiRobot,
  PiRocketLaunch,
  PiSunHorizon,
} from 'react-icons/pi';

import { SettingsTabSkeleton } from './components/SettingsSkeleton';
import { useAntragsgruenSites } from './hooks/useAntragsgruenSites';
import { useNuudelPolls } from './hooks/useNuudelPolls';
import { useSettingsDialogStore, type SettingsTab } from './settingsDialogStore';
import { searchSettings, type SettingsSearchHit } from './settingsSearch';
import {
  cancelSettingsHoverPreload,
  getSettingsTabComponent,
  preloadRemainingSettingsTabs,
  preloadSettingsTab,
  preloadSettingsTabOnHover,
} from './settingsTabs';
import { useOnboarding } from './useOnboarding';

// Vier Gruppen wie in Claudes Einstellungen: was man an sich selbst einstellt,
// was der Grünerator über einen weiß, wohin er sich verbindet, und was man nur
// nachschlägt. Die Einrichtung steht ohne Gruppe davor — einmalig, deshalb ganz
// oben und deshalb wieder weg.
const NAV_GROUPS: { key: SettingsNavGroup; label: string }[] = [
  { key: 'praeferenzen', label: 'Präferenzen' },
  { key: 'gruenerator', label: 'Dein Grünerator' },
  { key: 'verbindungen', label: 'Verbindungen' },
  { key: 'uebersicht', label: 'Übersicht' },
];

type SettingsNavGroup = 'praeferenzen' | 'gruenerator' | 'verbindungen' | 'uebersicht';

/** Reiter, die es nur gibt, wo ihr Dienst eingerichtet ist oder die Person dort schon etwas hat. */
export type OptionalSettingsTab = Extract<SettingsTab, 'antragsgruen' | 'nuudel'>;
export type AvailableOptionalTabs = Partial<Record<OptionalSettingsTab, boolean>>;

// onlyWhileOnboarding: verschwindet, sobald die Einrichtung erledigt ist.
// onlyWith: nur, wo der Dienst eingerichtet ist oder die Person dort schon
// etwas hat — Antragsgrün-Seiten (experimentell, nur de-DE), nuudel-Umfragen.
//
// Die Liste bleibt ein statisches, flaches Array-Literal in Anzeigereihenfolge:
// documentation/scripts/generate-settings.mjs liest sie per AST aus, um die
// Doku gegen die Oberfläche zu prüfen. Gruppiert und gefiltert wird beim
// Rendern, nicht hier.
const NAV: {
  value: SettingsTab;
  label: string;
  icon: IconType;
  group?: SettingsNavGroup;
  onlyWhileOnboarding?: boolean;
  onlyWith?: OptionalSettingsTab;
}[] = [
  {
    value: 'onboarding',
    label: 'Onboarding',
    icon: PiRocketLaunch,
    onlyWhileOnboarding: true,
  },
  { value: 'allgemein', label: 'Allgemein', icon: FiSettings, group: 'praeferenzen' },
  { value: 'konto', label: 'Konto', icon: FiUser, group: 'praeferenzen' },
  { value: 'hintergrund', label: 'Hintergrund', icon: PiPaintBrushBroad, group: 'praeferenzen' },
  { value: 'friends', label: 'Friends', icon: PiRobot, group: 'praeferenzen' },
  { value: 'benachrichtigungen', label: 'Benachrichtigungen', icon: FiBell, group: 'praeferenzen' },
  {
    value: 'datenschutz',
    label: 'Datenschutz',
    icon: FiShield,
    group: 'praeferenzen',
  },
  { value: 'personalisierung', label: 'Personalisierung', icon: FiSliders, group: 'gruenerator' },
  {
    value: 'erinnerungen',
    label: 'Erinnerungen',
    icon: PiBrain,
    group: 'gruenerator',
  },
  { value: 'tagesbriefing', label: 'Tagesbriefing', icon: PiSunHorizon, group: 'gruenerator' },
  { value: 'briefe', label: 'Briefe', icon: PiEnvelopeSimple, group: 'gruenerator' },
  {
    value: 'konnektoren',
    label: 'Konnektoren',
    icon: FiServer,
    group: 'verbindungen',
  },
  { value: 'wolke', label: 'Wolke', icon: FiCloud, group: 'verbindungen' },
  { value: 'websites', label: 'Meine Websites', icon: FiGlobe, group: 'verbindungen' },
  {
    value: 'antragsgruen',
    label: 'Antragsgrün',
    icon: FiClipboard,
    group: 'verbindungen',
    onlyWith: 'antragsgruen',
  },
  {
    value: 'nuudel',
    label: 'Umfragen',
    icon: FiCalendar,
    group: 'verbindungen',
    onlyWith: 'nuudel',
  },
  { value: 'nutzung', label: 'Nutzung', icon: FiBarChart2, group: 'uebersicht' },
  { value: 'support', label: 'Support', icon: FiHelpCircle, group: 'uebersicht' },
];

type SettingsNavEntry = (typeof NAV)[number];

/**
 * Die Einträge in ihren Gruppen, leere Gruppen weggelassen. Einträge ohne
 * Gruppe (die Einrichtung) kommen als Block ohne Überschrift zuerst.
 */
export function groupSettingsNav(
  entries: SettingsNavEntry[]
): { key: string; label: string | null; entries: SettingsNavEntry[] }[] {
  const ungrouped = entries.filter((e) => !e.group);
  return [
    ...(ungrouped.length ? [{ key: 'ohne', label: null, entries: ungrouped }] : []),
    ...NAV_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      entries: entries.filter((e) => e.group === g.key),
    })).filter((g) => g.entries.length > 0),
  ];
}

/** Die Seitenleiste, wie sie in diesem Moment aussieht. */
export function visibleSettingsNav(isOnboarding: boolean, available: AvailableOptionalTabs = {}) {
  return NAV.filter(
    (entry) =>
      (!entry.onlyWhileOnboarding || isOnboarding) &&
      (!entry.onlyWith || available[entry.onlyWith] === true)
  );
}

/**
 * Welcher Bereich beim Öffnen offen ist.
 *
 * Zwei Regeln, in dieser Reihenfolge:
 *
 * 1. Solange die Einrichtung offen ist, landet ein Öffnen ohne Ziel dort — der
 *    erste Aufruf der Einstellungen also immer. Wer einen Bereich benennt
 *    (Deep-Link, Menüeintrag, Klick in der Seitenleiste), bekommt seinen.
 * 2. Ein Bereich, den die Seitenleiste gerade nicht führt, fällt auf Allgemein
 *    zurück. Das ist der Moment nach dem letzten Schritt: Die Einrichtung nimmt
 *    ihren eigenen Reiter aus der Liste, und ohne den Rückfall stünde der Store
 *    auf einem Reiter, den es nicht mehr gibt.
 */
export function resolveSettingsTab(
  tab: SettingsTab,
  tabWasNamed: boolean,
  isOnboarding: boolean,
  available: AvailableOptionalTabs = {}
): SettingsTab {
  const wanted = !tabWasNamed && isOnboarding ? 'onboarding' : tab;
  return visibleSettingsNav(isOnboarding, available).some((entry) => entry.value === wanted)
    ? wanted
    : 'allgemein';
}

/**
 * Ob das Schließen des Dialogs die Einrichtung als erledigt verbucht.
 *
 * Wer aus der Einrichtung heraus zumacht, ist damit fertig — sonst steht der
 * Bereich beim nächsten Öffnen wieder da, obwohl die Schritte längst durchlaufen
 * sind. Nur „Fertig" zu zählen macht das Wegklicken zu einem Weg, der nirgendwo
 * hinführt. Aus einem anderen Bereich heraus zählt es nicht: Dort hat die
 * Einrichtung gar nicht stattgefunden, sie steht nur noch in der Seitenleiste.
 * Zurückholen lässt sie sich über Allgemein → „Einrichtung erneut starten".
 */
export function closeCompletesOnboarding(isOnboarding: boolean, activeTab: SettingsTab): boolean {
  return isOnboarding && activeTab === 'onboarding';
}

// Radix only renders the active tab's content, so resolving the component in
// here rather than in the map below means a tab's lazy-vs-already-loaded choice
// is only fixed when it actually renders — a hover that preloads it first still
// gets the path that never suspends.
const SettingsTabBody = ({ tab }: { tab: SettingsTab }) => {
  const TabBody = getSettingsTabComponent(tab);
  return (
    <Suspense fallback={<SettingsTabSkeleton tab={tab} />}>
      {/* Not created during render: getSettingsTabComponent hands back one
          frozen component per tab, so the identity never changes. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <TabBody />
    </Suspense>
  );
};

// Das Aufblitzen der gefundenen Zeile: nur ein Farbton, keine Bewegung, damit es
// unter prefers-reduced-motion nichts zu unterdrücken gibt. Als Literal, weil
// Tailwind die Klassen aus dem Quelltext liest.
const FLASH_CLASSES = 'rounded-md bg-primary-100 dark:bg-primary-950'.split(' ');
const FLASH_MS = 1200;
const FIND_ROW_FRAMES = 120; // ≈ 2 s
const SETTLED_GIVE_UP_FRAMES = 6;

// Der lazy Reiter ist aufgelöst, wenn Inhalt da ist und kein Skelett mehr lädt.
const tabBodySettled = (root: HTMLElement | null) =>
  root !== null &&
  root.querySelector('h2') !== null &&
  root.querySelector('[aria-busy="true"]') === null;

const SettingsDialog = () => {
  const isOpen = useSettingsDialogStore((s) => s.isOpen);
  const tab = useSettingsDialogStore((s) => s.tab);
  const tabWasNamed = useSettingsDialogStore((s) => s.tabWasNamed);
  const paneOpen = useSettingsDialogStore((s) => s.paneOpen);
  const setTab = useSettingsDialogStore((s) => s.setTab);
  const showNav = useSettingsDialogStore((s) => s.showNav);
  const close = useSettingsDialogStore((s) => s.close);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { isActive: isOnboarding, complete: completeOnboarding } = useOnboarding();
  const navRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const findFrameRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const flashedRowRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');

  const { data: antragsgruenSites } = useAntragsgruenSites();
  // Solange die Liste lädt, bleibt ein direkt angesteuerter Reiter stehen,
  // statt auf Allgemein zurückzufallen.
  const { data: nuudelPolls } = useNuudelPolls();
  const available: AvailableOptionalTabs = {
    antragsgruen: antragsgruenSites
      ? antragsgruenSites.enabled || antragsgruenSites.sites.length > 0
      : tab === 'antragsgruen',
    nuudel: nuudelPolls ? nuudelPolls.enabled || nuudelPolls.polls.length > 0 : tab === 'nuudel',
  };
  const nav = visibleSettingsNav(isOnboarding, available);
  const activeTab = resolveSettingsTab(tab, tabWasNamed, isOnboarding, available);
  const activeEntry = nav.find((entry) => entry.value === activeTab);

  // Schmal steht entweder die Liste oder der Bereich da. Die offene
  // Einrichtung öffnet ohne Ziel direkt in sich selbst, wie auf breitem Schirm.
  const showPane = paneOpen || (isOnboarding && !tabWasNamed);
  const narrowView = isMobile ? (showPane ? 'pane' : 'nav') : null;

  // The active tab is the one signal we have that this user is in settings at
  // all: warm its data now, and pull the other tab chunks in during idle time
  // so switching between them never waits on the network.
  useEffect(() => {
    if (!isOpen) return;
    preloadSettingsTab(activeTab, queryClient);
    return preloadRemainingSettingsTabs(activeTab);
  }, [isOpen, activeTab, queryClient]);

  const handleClose = () => {
    if (closeCompletesOnboarding(isOnboarding, activeTab)) completeOnboarding();
    close();
  };

  // Schmal verschwindet beim Wechsel das Element, das den Fokus hatte. Ohne
  // Nachführen fiele er auf <body>, und ein Screenreader wüsste nicht, wo er
  // ist. Ein Effekt statt der Klick-Handler, weil auch Reiter selbst den
  // Bereich wechseln (Allgemein → „Einrichtung erneut starten"). Den ersten
  // Durchlauf übernimmt onOpenAutoFocus.
  const narrowPlace = narrowView === null ? null : `${narrowView}:${activeTab}`;
  const lastNarrowPlace = useRef(narrowPlace);
  useEffect(() => {
    if (narrowPlace === lastNarrowPlace.current) return;
    lastNarrowPlace.current = narrowPlace;
    if (narrowView === 'pane') backRef.current?.focus();
    else if (narrowView === 'nav')
      navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
  }, [narrowPlace, narrowView]);

  const searching = query.trim() !== '';
  const hits = searching ? searchSettings(query, nav) : [];

  const cancelFind = () => {
    if (findFrameRef.current !== null) cancelAnimationFrame(findFrameRef.current);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    findFrameRef.current = null;
    flashTimerRef.current = null;
    flashedRowRef.current?.classList.remove(...FLASH_CLASSES);
    flashedRowRef.current = null;
  };

  // Schließt der Dialog (auch von außen) oder verschwindet er, endet die Suche:
  // Feld leer, keine Schleife, kein Timer, der auf eine alte Zeile zeigt.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setQuery('');
  }
  useEffect(() => {
    if (!isOpen) cancelFind();
    return cancelFind;
  }, [isOpen]);

  const openHit = (hit: SettingsSearchHit) => {
    cancelFind();
    setTab(hit.tab);
    setQuery('');
    const rowId = hit.rowId;
    // Der angeklickte Treffer verschwindet mit der Liste und nimmt den Fokus
    // mit. Breit führen wir ihn selbst nach; schmal übernimmt der Effekt oben.
    const wide = narrowView === null;
    // Die Reiter laden lazy: die Zeile steht oft erst ein paar Frames später da.
    let frames = 0;
    let settled = 0;
    const find = () => {
      findFrameRef.current = null;
      const row =
        rowId === null
          ? null
          : sectionRef.current?.querySelector<HTMLElement>(
              `[data-settings-id="${CSS.escape(rowId)}"]`
            );
      const navEntry =
        rowId === null ? navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') : null;
      if (row) {
        row.scrollIntoView({ block: 'center' });
        row.classList.add(...FLASH_CLASSES);
        flashedRowRef.current = row;
        flashTimerRef.current = window.setTimeout(() => {
          row.classList.remove(...FLASH_CLASSES);
          flashedRowRef.current = null;
          flashTimerRef.current = null;
        }, FLASH_MS);
        if (wide) {
          const control = row.querySelector<HTMLElement>(
            'button, a[href], input, select, textarea, [role="combobox"], [tabindex]:not([tabindex="-1"])'
          );
          (control ?? sectionRef.current)?.focus({ preventScroll: true });
        }
      } else if (navEntry) {
        if (wide) navEntry.focus();
      } else if (
        ++frames < FIND_ROW_FRAMES &&
        // Steht der Reiter fertig da (Inhalt, kein Skelett) und die Zeile fehlt
        // weiter, wird sie gar nicht gerendert: nach wenigen Frames aufgeben.
        (settled += tabBodySettled(sectionRef.current) ? 1 : 0) < SETTLED_GIVE_UP_FRAMES
      ) {
        findFrameRef.current = requestAnimationFrame(find);
      } else if (wide) {
        sectionRef.current?.focus({ preventScroll: true });
      }
    };
    findFrameRef.current = requestAnimationFrame(find);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        showCloseButton={false}
        // Escape leert zuerst die Suche; erst ein zweites schließt den Dialog.
        // Radix hört auf Dokumentebene, ein stopPropagation am Feld käme zu spät.
        onEscapeKeyDown={(event) => {
          if (query.trim() === '') return;
          event.preventDefault();
          setQuery('');
        }}
        // Radix fokussiert sonst das erste Fokussierbare, und das ist jetzt
        // das Schließen-Kreuz. Der Fokus gehört dahin, wo man ist: auf den
        // offenen Bereich in der Navigation, schmal im Bereich auf „Zurück".
        onOpenAutoFocus={(event) => {
          const target =
            backRef.current ??
            navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
            navRef.current?.querySelector<HTMLElement>('button');
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        className="flex w-full flex-col gap-0 overflow-hidden p-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-dvh max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-none md:h-[min(85vh,50rem)] md:max-w-[64rem] md:rounded-2xl"
      >
        <DialogDescription className="sr-only">
          Einstellungen für Konto, Personalisierung, Benachrichtigungen und Verbindungen
        </DialogDescription>
        <div className="flex h-13 shrink-0 items-center gap-xs border-b border-grey-200 pr-sm pl-md dark:border-grey-800 md:pl-lg">
          {narrowView === 'pane' && (
            <button
              ref={backRef}
              type="button"
              onClick={showNav}
              aria-label="Zurück zu allen Bereichen"
              className="-ml-xs flex size-11 items-center justify-center rounded-md text-foreground/70 hover:bg-hover-alt hover:text-foreground"
            >
              <FiChevronLeft size={20} />
            </button>
          )}
          <DialogTitle className="m-0 flex-1 font-[Raleway] text-[17px] font-semibold text-foreground-heading">
            Einstellungen
          </DialogTitle>
          <DialogClose
            aria-label="Einstellungen schließen"
            className="flex size-9 items-center justify-center rounded-md text-foreground/70 hover:bg-hover-alt hover:text-foreground pointer-coarse:size-11"
          >
            <FiX size={18} />
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            ref={navRef}
            aria-label="Bereiche"
            hidden={narrowView === 'pane'}
            className="flex min-h-0 w-full shrink-0 flex-col gap-md overflow-y-auto px-sm py-md md:w-60 md:border-r md:border-grey-200 md:bg-background-alt/50 md:px-2.5 md:py-3.5 dark:md:border-grey-800"
          >
            <div className="relative">
              <FiSearch
                size={15}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-foreground/60"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Suchen"
                aria-label="Einstellungen durchsuchen"
                autoComplete="off"
                className="h-11 w-full rounded-md border-0 bg-input-bg pr-3 pl-9 text-sm text-input-text outline-none placeholder:text-foreground/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-[34px]"
              />
              <p className="sr-only" aria-live="polite">
                {searching ? `${hits.length} Treffer` : ''}
              </p>
            </div>
            {searching ? (
              hits.length === 0 ? (
                <p className="m-0 px-2.5 text-sm text-foreground/65">
                  Keine Treffer für „{query.trim()}“
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-px p-0">
                  {hits.map((hit) => (
                    <li key={hit.key}>
                      <button
                        type="button"
                        onClick={() => openHit(hit)}
                        className="flex min-h-11 w-full flex-col justify-center rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-hover-alt md:min-h-8.5"
                      >
                        <span>{hit.title}</span>
                        {hit.tabLabel && (
                          <span className="text-xs text-foreground/65">{hit.tabLabel}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              groupSettingsNav(nav).map((group) => (
                <div key={group.key} className="flex flex-col">
                  {group.label && (
                    <h3
                      id={`settings-nav-${group.key}`}
                      className="m-0 px-2.5 pt-1.5 pb-1 text-xs font-normal text-foreground/65"
                    >
                      {group.label}
                    </h3>
                  )}
                  <ul
                    aria-labelledby={group.label ? `settings-nav-${group.key}` : undefined}
                    className="m-0 flex list-none flex-col gap-px p-0"
                  >
                    {group.entries.map(({ value, label, icon: Icon }) => (
                      <li key={value}>
                        <button
                          type="button"
                          aria-current={value === activeTab ? 'page' : undefined}
                          onClick={() => setTab(value)}
                          // Settling on a nav entry is enough intent to fetch its
                          // chunk and data — by the time the click lands the tab
                          // renders with content instead of a placeholder. Merely
                          // passing over it on the way down the list is not, hence
                          // the intent delay.
                          onPointerEnter={() => preloadSettingsTabOnHover(value, queryClient)}
                          onPointerLeave={cancelSettingsHoverPreload}
                          onFocus={() => preloadSettingsTabOnHover(value, queryClient)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-hover-alt',
                            'min-h-11 py-1.5 md:min-h-8.5',
                            // Schmal ist die Liste eine Übersicht, kein Ort:
                            // dort markiert die Pille nichts.
                            narrowView === null &&
                              'aria-[current=page]:bg-primary-100 aria-[current=page]:font-semibold aria-[current=page]:text-primary-700 dark:aria-[current=page]:bg-primary-950 dark:aria-[current=page]:text-primary-200'
                          )}
                        >
                          <Icon size={16} className="shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1">{label}</span>
                          {narrowView === 'nav' && (
                            <FiChevronRight size={16} className="text-foreground/50" aria-hidden />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </nav>

          {activeEntry && narrowView !== 'nav' && (
            <section
              ref={sectionRef}
              tabIndex={-1}
              // Neuer Bereich, neuer Scroll-Container: sonst öffnet ein Wechsel
              // mitten im neuen Bereich, so tief, wie man im alten war.
              key={activeTab}
              aria-label={activeEntry.label}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none"
            >
              <div className="px-md py-lg md:px-xl">
                <SettingsTabBody tab={activeTab} />
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
