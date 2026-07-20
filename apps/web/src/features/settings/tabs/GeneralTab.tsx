import { Button, toast } from '@gruenerator/ui';
import { RotateCcw } from 'lucide-react';
import { type IconType } from 'react-icons';
import { PiDesktop, PiMoon, PiSun } from 'react-icons/pi';

import SettingsRow from '../components/SettingsRow';

import useDarkMode, { type ThemePreference } from '@/components/hooks/useDarkMode';
import { resetAllTours } from '@/features/tours/tourState';
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

const GeneralTab = () => {
  const [, , themePreference, , setThemePreference] = useDarkMode();
  const locale = useAuthStore((s) => s.locale);
  const updateLocale = useAuthStore((s) => s.updateLocale);

  return (
    <div className="-my-4 divide-y divide-grey-200 dark:divide-grey-800">
      <SettingsRow title="Aussehen" description="Farbschema der Oberfläche">
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

      <SettingsRow
        title="Sprache & Region"
        description="Wortwahl und Inhalte für Deutschland oder Österreich"
      >
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

      <SettingsRow
        title="Einführungs-Touren zurücksetzen"
        description="Zeigt die Touren durch Workplace, Dokumente, Tabellen, Präsentationen und das Sharepic-Studio beim nächsten Öffnen wieder an."
      >
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
