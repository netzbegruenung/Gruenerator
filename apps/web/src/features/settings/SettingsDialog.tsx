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
import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { type IconType } from 'react-icons';
import { FiBell, FiCloud, FiServer, FiSettings, FiSliders, FiUser } from 'react-icons/fi';
import { PiBrain } from 'react-icons/pi';

import Spinner from '../../components/common/Spinner';

import { useSettingsDialogStore, type SettingsTab } from './settingsDialogStore';

// hideHeading: the tab's content brings its own top-level heading.
const NAV: { value: SettingsTab; label: string; icon: IconType; hideHeading?: boolean }[] = [
  { value: 'allgemein', label: 'Allgemein', icon: FiSettings },
  { value: 'konto', label: 'Konto', icon: FiUser },
  { value: 'personalisierung', label: 'Personalisierung', icon: FiSliders },
  { value: 'erinnerungen', label: 'Erinnerungen', icon: PiBrain, hideHeading: true },
  { value: 'benachrichtigungen', label: 'Benachrichtigungen', icon: FiBell },
  { value: 'wolke', label: 'Wolke', icon: FiCloud },
  { value: 'konnektoren', label: 'Konnektoren', icon: FiServer, hideHeading: true },
];

const TAB_COMPONENTS: Record<SettingsTab, LazyExoticComponent<ComponentType>> = {
  allgemein: lazy(() => import('./tabs/GeneralTab')),
  konto: lazy(() => import('./tabs/AccountTab')),
  personalisierung: lazy(() => import('./tabs/PersonalizationTab')),
  erinnerungen: lazy(() => import('./tabs/MemoriesSection')),
  benachrichtigungen: lazy(() => import('./tabs/NotificationsTab')),
  wolke: lazy(() => import('./tabs/WolkeTab')),
  konnektoren: lazy(() => import('./tabs/ConnectorsTab')),
};

const SettingsDialog = () => {
  const isOpen = useSettingsDialogStore((s) => s.isOpen);
  const tab = useSettingsDialogStore((s) => s.tab);
  const setTab = useSettingsDialogStore((s) => s.setTab);
  const close = useSettingsDialogStore((s) => s.close);
  const isMobile = useIsMobile();

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
                  className="shrink-0 justify-start gap-2 whitespace-nowrap md:py-1.5"
                >
                  <Icon size={15} />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {NAV.map(({ value, label, hideHeading }) => {
            const TabBody = TAB_COMPONENTS[value];
            return (
              <TabsContent key={value} value={value} className="min-h-0 min-w-0 flex-1">
                <div className="h-full overflow-y-auto">
                  <div className="px-md py-lg sm:px-xl">
                    {!hideHeading && (
                      <h2 className="mt-0 mb-lg text-lg font-semibold text-foreground-heading">
                        {label}
                      </h2>
                    )}
                    <Suspense
                      fallback={
                        <div className="flex justify-center py-xl">
                          <Spinner size="medium" />
                        </div>
                      }
                    >
                      <TabBody />
                    </Suspense>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
