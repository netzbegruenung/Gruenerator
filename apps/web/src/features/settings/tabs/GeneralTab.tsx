import { type FeedbackButtonMode, type StartPage } from '@gruenerator/contracts';
import { Button, toast } from '@gruenerator/ui';
import { Check, RotateCcw } from 'lucide-react';
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

import SettingsRow from '../components/SettingsRow';

import useDarkMode, { type ThemePreference } from '@/components/hooks/useDarkMode';
import { resetAllTours } from '@/features/tours/tourState';
import { CHAT_BACKGROUND_PRESETS } from '@/features/workplace/chatBackgrounds';
import { useAuthStore, type SupportedLocale } from '@/stores/authStore';
import { cn } from '@/utils/cn';

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
  const chatBackground = useAuthStore((s) => s.user?.chat_background ?? 'sunrise');
  const updateChatBackground = useAuthStore((s) => s.updateChatBackground);
  const startPage = useAuthStore((s) => s.user?.default_startpage ?? 'chat');
  const updateStartPage = useAuthStore((s) => s.updateStartPage);
  const feedbackButton = useAuthStore((s) => s.user?.feedback_button ?? 'text');
  const updateFeedbackButton = useAuthStore((s) => s.updateFeedbackButton);

  return (
    <div className="-my-4 divide-y divide-grey-200 dark:divide-grey-800">
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

      <SettingsRow id="allgemein.chatHintergrund">
        <div className="flex gap-1.5">
          {CHAT_BACKGROUND_PRESETS.map(({ key, label, swatch, accent }) => (
            <button
              key={key}
              type="button"
              onClick={() => void updateChatBackground(key)}
              aria-label={label}
              aria-pressed={chatBackground === key}
              title={label}
              className={cn(
                'flex size-7 items-center justify-center rounded-full border transition-all',
                chatBackground === key
                  ? 'border-primary-500 ring-2 ring-primary-500/25'
                  : 'border-grey-300 hover:scale-110 dark:border-grey-600'
              )}
              style={{ backgroundImage: swatch }}
            >
              {/* Der Haken trägt die Akzentfarbe — so zeigt das ausgewählte
                  Plättchen gleich mit, welche Farbe der Senden-Button bekommt. */}
              {chatBackground === key && (
                <Check
                  className="size-3.5 text-primary-700"
                  style={accent ? { color: accent } : undefined}
                />
              )}
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow id="allgemein.sprache">
        <div className="flex gap-xxs">
          {LOCALE_OPTIONS.map(({ value, flag, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => void updateLocale(value)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-lg transition-all',
                locale === value ? 'bg-primary-500/10 opacity-100' : 'opacity-40 hover:opacity-70'
              )}
              aria-label={label}
              title={label}
            >
              {flag}
            </button>
          ))}
        </div>
      </SettingsRow>

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
  );
};

export default GeneralTab;
