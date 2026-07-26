import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect } from 'react';
import { type IconType } from 'react-icons';
import {
  FiBarChart2,
  FiBell,
  FiCloud,
  FiGlobe,
  FiHelpCircle,
  FiServer,
  FiSettings,
  FiSliders,
} from 'react-icons/fi';
import { IoAccessibilityOutline } from 'react-icons/io5';
import { PiBrain, PiEnvelopeSimple, PiPencil, PiRobot } from 'react-icons/pi';

import { SettingsTabSkeleton } from './components/SettingsSkeleton';
import { useSettingsDialogStore, type SettingsTab } from './settingsDialogStore';
import {
  cancelSettingsHoverPreload,
  getSettingsTabComponent,
  preloadRemainingSettingsTabs,
  preloadSettingsTab,
  preloadSettingsTabOnHover,
} from './settingsTabs';

// hideHeading: the tab's content brings its own top-level heading.
const NAV: { value: SettingsTab; label: string; icon: IconType; hideHeading?: boolean }[] = [
  { value: 'allgemein', label: 'Allgemein', icon: FiSettings },
  { value: 'barrierefreiheit', label: 'Barrierefreiheit', icon: IoAccessibilityOutline },
  { value: 'friends', label: 'Friends', icon: PiRobot },
  { value: 'personalisierung', label: 'Personalisierung', icon: FiSliders },
  { value: 'briefe', label: 'Briefe', icon: PiEnvelopeSimple },
  { value: 'texte-anlernen', label: 'Texte anlernen', icon: PiPencil },
  { value: 'erinnerungen', label: 'Erinnerungen', icon: PiBrain, hideHeading: true },
  { value: 'benachrichtigungen', label: 'Benachrichtigungen', icon: FiBell },
  { value: 'wolke', label: 'Wolke', icon: FiCloud },
  { value: 'websites', label: 'Meine Websites', icon: FiGlobe },
  { value: 'konnektoren', label: 'Konnektoren', icon: FiServer, hideHeading: true },
  { value: 'nutzung', label: 'Nutzung', icon: FiBarChart2 },
  { value: 'support', label: 'Support', icon: FiHelpCircle },
];

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

const SettingsDialog = () => {
  const isOpen = useSettingsDialogStore((s) => s.isOpen);
  const tab = useSettingsDialogStore((s) => s.tab);
  const setTab = useSettingsDialogStore((s) => s.setTab);
  const close = useSettingsDialogStore((s) => s.close);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // The active tab is the one signal we have that this user is in settings at
  // all: warm its data now, and pull the other tab chunks in during idle time
  // so switching between them never waits on the network.
  useEffect(() => {
    if (!isOpen) return;
    preloadSettingsTab(tab, queryClient);
    return preloadRemainingSettingsTabs(tab);
  }, [isOpen, tab, queryClient]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex w-full flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-none sm:h-[min(85vh,46rem)] sm:max-w-4xl">
        <DialogDescription className="sr-only">
          Einstellungen für Konto, Personalisierung, Benachrichtigungen und Verbindungen
        </DialogDescription>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as SettingsTab)}
          orientation={isMobile ? 'horizontal' : 'vertical'}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="flex shrink-0 flex-col border-grey-200 max-md:border-b dark:border-grey-700 md:w-56 md:border-r md:bg-background-alt/50">
            <DialogTitle className="px-md pt-4 pb-2 text-base font-semibold text-foreground-heading md:px-4 md:pt-5">
              Einstellungen
            </DialogTitle>
            <TabsList
              variant="line"
              className="w-full shrink-0 justify-start gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:items-stretch md:px-3 md:pb-lg"
            >
              {NAV.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  // Settling on a nav entry is enough intent to fetch its chunk
                  // and data — by the time the click lands the tab renders with
                  // content instead of a placeholder. Merely passing over it on
                  // the way down the list is not, hence the intent delay.
                  onPointerEnter={() => preloadSettingsTabOnHover(value, queryClient)}
                  onPointerLeave={cancelSettingsHoverPreload}
                  onFocus={() => preloadSettingsTabOnHover(value, queryClient)}
                  // Active = bold text only: no indicator bar, no background pill.
                  className="shrink-0 justify-start gap-2 whitespace-nowrap text-foreground/70 after:hidden data-[state=active]:font-semibold data-[state=active]:text-foreground md:py-1.5"
                >
                  <Icon size={15} />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {NAV.map(({ value, label, hideHeading }) => (
            <TabsContent key={value} value={value} className="min-h-0 min-w-0 flex-1">
              <div className="h-full overflow-y-auto">
                <div className="px-md py-lg sm:px-xl">
                  {!hideHeading && (
                    <h2 className="mt-0 mb-lg text-lg font-semibold text-foreground-heading">
                      {label}
                    </h2>
                  )}
                  <SettingsTabBody tab={value} />
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
