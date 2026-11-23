import { type FeedbackButtonMode, type StartLayout, type StartPage } from '@gruenerator/contracts';
import { getPinnedLocale } from '@gruenerator/shared/instances';
import { DEFAULT_TTS_VOICE_ID } from '@gruenerator/shared/settings';
import { Button, Switch, toast } from '@gruenerator/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  PiRows,
  PiTabs,
  PiTextT,
} from 'react-icons/pi';

import { CURRENT_INSTANCE } from '../../../config/instance';
import VoicePicker from '../../voice/components/VoicePicker';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow from '../components/SettingsRow';
import SettingsSection from '../components/SettingsSection';
import { useSettingsDialogStore } from '../settingsDialogStore';
import { useOnboarding } from '../useOnboarding';

import useDarkMode, { type ThemePreference } from '@/components/hooks/useDarkMode';
import { QUERY_KEYS, useProfile } from '@/features/auth/hooks/useProfileData';
import { profileApiService, type Profile } from '@/features/auth/services/profileApiService';
import { resetAllTours } from '@/features/tours/tourState';
import { useAuthStore, type SupportedLocale } from '@/stores/authStore';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconType }[] = [
  { value: 'light', label: 'Hell', icon: PiSun },
  { value: 'dark', label: 'Dunkel', icon: PiMoon },
  { value: 'system', label: 'System', icon: PiDesktop },
];

const LOCALE_OPTIONS: { value: SupportedLocale; label: string }[] = [
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'de-AT', label: 'Deutsch (Österreich)' },
];

const START_PAGE_OPTIONS: { value: StartPage; label: string; icon: IconType }[] = [
  { value: 'chat', label: 'Chat', icon: PiChatCircle },
  { value: 'arbeiten', label: 'Arbeiten', icon: PiBriefcase },
];

const START_LAYOUT_OPTIONS: { value: StartLayout; label: string; icon: IconType }[] = [
  { value: 'combined', label: 'Alles auf einer Seite', icon: PiRows },
  { value: 'tabs', label: 'Tabs', icon: PiTabs },
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
  const startLayout = useAuthStore((s) => s.user?.start_layout ?? 'combined');
  const updateStartLayout = useAuthStore((s) => s.updateStartLayout);
  const ttsVoice = useAuthStore((s) => s.user?.tts_voice_id ?? DEFAULT_TTS_VOICE_ID);
  const updateTtsVoice = useAuthStore((s) => s.updateTtsVoice);
  const feedbackButton = useAuthStore((s) => s.user?.feedback_button ?? 'text');
  const updateFeedbackButton = useAuthStore((s) => s.updateFeedbackButton);
  const reduceMotion = useAuthStore((s) => s.user?.reduce_motion ?? false);
  const reduceTransparency = useAuthStore((s) => s.user?.reduce_transparency ?? false);
  const updateA11yPreference = useAuthStore((s) => s.updateA11yPreference);
  const setTab = useSettingsDialogStore((s) => s.setTab);
  const { isActive: isOnboarding, restart: restartOnboarding } = useOnboarding();
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const { data: profile } = useProfile(userId);
  const scheduledTasksEnabled = profile?.scheduled_tasks_enabled === true;
  const scheduledTasks = useMutation({
    mutationFn: (next: boolean) =>
      profileApiService.updateProfile({ scheduled_tasks_enabled: next }),
    onSuccess: (updated: Profile) => {
      queryClient.setQueryData(QUERY_KEYS.profile(userId), (old: Profile | undefined) => ({
        ...old,
        ...updated,
      }));
    },
    onError: () => toast.error('Einstellung konnte nicht gespeichert werden.'),
  });

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Darstellung">
        <SettingsRow id="allgemein.aussehen">
          <SegmentedControl
            aria-label="Aussehen"
            value={themePreference}
            onChange={setThemePreference}
            options={THEME_OPTIONS.map(({ value, label, icon: Icon }) => ({
              value,
              label,
              icon: <Icon aria-hidden className="size-4" />,
            }))}
          />
        </SettingsRow>

        <SettingsRow id="allgemein.startlayout">
          <SegmentedControl
            aria-label="Aufbau der Startseite"
            value={startLayout}
            onChange={(value) => void updateStartLayout(value)}
            options={START_LAYOUT_OPTIONS.map(({ value, label, icon: Icon }) => ({
              value,
              label,
              icon: <Icon aria-hidden className="size-4" />,
            }))}
          />
        </SettingsRow>

        {/* Only tabs have a first tab to choose; the combined page has one view. */}
        {startLayout === 'tabs' && (
          <SettingsRow id="allgemein.startseite">
            <SegmentedControl
              aria-label="Startseite"
              value={startPage}
              onChange={(value) => void updateStartPage(value)}
              options={START_PAGE_OPTIONS.map(({ value, label, icon: Icon }) => ({
                value,
                label,
                icon: <Icon aria-hidden className="size-4" />,
              }))}
            />
          </SettingsRow>
        )}

        <SettingsRow id="allgemein.feedbackButton">
          <SegmentedControl
            aria-label="Support-Button"
            value={feedbackButton}
            onChange={(value) => void updateFeedbackButton(value)}
            options={FEEDBACK_BUTTON_OPTIONS.map(({ value, label, icon: Icon }) => ({
              value,
              label,
              icon: <Icon aria-hidden className="size-4" />,
            }))}
          />
        </SettingsRow>

        <SettingsRow id="allgemein.stimme">
          <VoicePicker
            value={ttsVoice}
            onChange={(voice) => void updateTtsVoice(voice === DEFAULT_TTS_VOICE_ID ? null : voice)}
          />
        </SettingsRow>
      </SettingsSection>

      {/* An instance that pins its locale offers no switch: the other
          country's notebooks, agents and recipes are not deployed there, so
          switching would empty the app rather than translate it. */}
      {pinnedLocale === null && (
        <SettingsSection title="Region">
          <SettingsRow id="allgemein.sprache">
            <SegmentedControl
              aria-label="Sprache und Region"
              value={locale}
              onChange={(value) => void updateLocale(value)}
              options={LOCALE_OPTIONS}
            />
          </SettingsRow>
        </SettingsSection>
      )}

      <SettingsSection title="Bedienungshilfen">
        <SettingsRow id="barrierefreiheit.animationen">
          <Switch
            checked={reduceMotion}
            onCheckedChange={(checked) => void updateA11yPreference('reduce_motion', checked)}
            aria-label="Animationen reduzieren"
          />
        </SettingsRow>

        <SettingsRow id="barrierefreiheit.transparenz">
          <Switch
            checked={reduceTransparency}
            onCheckedChange={(checked) => void updateA11yPreference('reduce_transparency', checked)}
            aria-label="Transparenz und Unschärfe reduzieren"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Funktionen">
        <SettingsRow id="allgemein.geplanteAufgaben">
          <div className="flex items-center gap-sm">
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-200">
              Experimentell
            </span>
            <Switch
              checked={scheduledTasksEnabled}
              onCheckedChange={(checked) => scheduledTasks.mutate(checked)}
              disabled={scheduledTasks.isPending || !profile}
              aria-label="Geplante Aufgaben einschalten"
            />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Einführung">
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
      </SettingsSection>
    </div>
  );
};

export default GeneralTab;
