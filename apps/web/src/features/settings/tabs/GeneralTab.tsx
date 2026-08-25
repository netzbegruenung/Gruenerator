import { type FeedbackButtonMode, type StartPage } from '@gruenerator/contracts';
import { getPinnedLocale } from '@gruenerator/shared/instances';
import { Button, toast } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';
import { Rocket, RotateCcw } from 'lucide-react';
import { type IconType } from 'react-icons';
import {
  PiBriefcase,
  PiChatCircle,
  PiChatTeardropText,
  PiDesktop,
  PiEyeSlash,
  PiMoon,
  PiSun,
  PiTextT,
} from 'react-icons/pi';

import { CURRENT_INSTANCE } from '../../../config/instance';
import { AccountIdentityRow, DeleteAccountSection } from '../components/AccountSection';
import SettingsRow from '../components/SettingsRow';
import { useSettingsDialogStore } from '../settingsDialogStore';
import { useOnboarding } from '../useOnboarding';

import useDarkMode, { type ThemePreference } from '@/components/hooks/useDarkMode';
import { QUERY_KEYS } from '@/features/auth/hooks/useProfileData';
import { profileApiService } from '@/features/auth/services/profileApiService';
import { resetAllTours } from '@/features/tours/tourState';
import { useAuthStore, type SupportedLocale } from '@/stores/authStore';
import { cn } from '@/utils/cn';

// Die Kontozeile ganz oben liest das Profil — vorwärmen, damit sie beim Öffnen
// schon steht statt kurz zu pulsieren.
export const prefetch = (queryClient: QueryClient) => {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;
  void queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.profile(userId),
    queryFn: profileApiService.getProfile,
    staleTime: 15 * 60 * 1000,
  });
};

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconType }[] = [
  { value: 'light', label: 'Hell', icon: PiSun },
  { value: 'dark', label: 'Dunkel', icon: PiMoon },
  { value: 'system', label: 'System', icon: PiDesktop },
];

const LOCALE_OPTIONS: { value: SupportedLocale; flag: string; label: string }[] = [
  { value: 'de-DE', flag: '🇩🇪', label: 'Deutsch (Deutschland)' },
  { value: 'de-AT', flag: '🇦🇹', label: 'Deutsch (Österreich)' },
];

const START_PAGE_OPTIONS: { value: StartPage; label: string; icon: IconType }[] = [
  { value: 'chat', label: 'Chat', icon: PiChatCircle },
  { value: 'arbeiten', label: 'Arbeiten', icon: PiBriefcase },
];

const FEEDBACK_BUTTON_OPTIONS: { value: FeedbackButtonMode; label: string; icon: IconType }[] = [
  { value: 'text', label: 'Text', icon: PiTextT },
  { value: 'icon', label: 'Icon', icon: PiChatTeardropText },
  { value: 'off', label: 'Aus', icon: PiEyeSlash },
];

const GeneralTab = () => {
  const [, , themePreference, , setThemePreference] = useDarkMode();
  const locale = useAuthStore((s) => s.locale);
  const updateLocale = useAuthStore((s) => s.updateLocale);
  const pinnedLocale = getPinnedLocale(CURRENT_INSTANCE);
  const startPage = useAuthStore((s) => s.user?.default_startpage ?? 'chat');
  const updateStartPage = useAuthStore((s) => s.updateStartPage);
  const feedbackButton = useAuthStore((s) => s.user?.feedback_button ?? 'text');
  const updateFeedbackButton = useAuthStore((s) => s.updateFeedbackButton);
  const setTab = useSettingsDialogStore((s) => s.setTab);
  const { isActive: isOnboarding, restart: restartOnboarding } = useOnboarding();

  return (
    <div className="flex flex-col gap-lg">
      <div className="-mt-4 divide-y divide-grey-200 dark:divide-grey-800">
        <AccountIdentityRow />

        <SettingsRow id="allgemein.aussehen">
          <div className="flex rounded-lg border border-grey-200 p-0.5 dark:border-grey-700">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setThemePreference(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
                  themePreference === value
                    ? 'bg-background-alt font-medium text-foreground'
                    : 'text-grey-500 hover:text-foreground'
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </SettingsRow>

        {/* An instance that pins its locale offers no switch: the other
            country's notebooks, agents and recipes are not deployed there, so
            switching would empty the app rather than translate it. */}
        {pinnedLocale === null && (
          <SettingsRow id="allgemein.sprache">
            <div className="flex gap-xxs">
              {LOCALE_OPTIONS.map(({ value, flag, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void updateLocale(value)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md text-lg transition-all',
                    locale === value
                      ? 'bg-primary-500/10 opacity-100'
                      : 'opacity-40 hover:opacity-70'
                  )}
                  aria-label={label}
                  title={label}
                >
                  {flag}
                </button>
              ))}
            </div>
          </SettingsRow>
        )}

        <SettingsRow id="allgemein.startseite">
          <div className="flex rounded-lg border border-grey-200 p-0.5 dark:border-grey-700">
            {START_PAGE_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => void updateStartPage(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
                  startPage === value
                    ? 'bg-background-alt font-medium text-foreground'
                    : 'text-grey-500 hover:text-foreground'
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow id="allgemein.feedbackButton">
          <div className="flex rounded-lg border border-grey-200 p-0.5 dark:border-grey-700">
            {FEEDBACK_BUTTON_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => void updateFeedbackButton(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
                  feedbackButton === value
                    ? 'bg-background-alt font-medium text-foreground'
                    : 'text-grey-500 hover:text-foreground'
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </SettingsRow>

        {/* Nur, wenn die Einrichtung nicht ohnehin offen ist: eine Zeile, die
            einen Bereich zurückholt, der zwei Zentimeter weiter oben in der
            Seitenleiste steht, ist eine Schaltfläche ohne Wirkung. */}
        {!isOnboarding && (
          <SettingsRow id="allgemein.onboarding">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                restartOnboarding();
                setTab('onboarding');
              }}
            >
              <Rocket className="mr-xs h-4 w-4" />
              Starten
            </Button>
          </SettingsRow>
        )}

        <SettingsRow id="allgemein.touren">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetAllTours();
              toast.success('Touren zurückgesetzt — sie starten beim nächsten Besuch wieder.');
            }}
          >
            <RotateCcw className="mr-xs h-4 w-4" />
            Zurücksetzen
          </Button>
        </SettingsRow>
      </div>

      <DeleteAccountSection />
    </div>
  );
};

export default GeneralTab;
