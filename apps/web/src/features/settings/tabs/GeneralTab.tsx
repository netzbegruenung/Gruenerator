import { type FeedbackButtonMode, type StartPage } from '@gruenerator/contracts';
import { getPinnedLocale } from '@gruenerator/shared/instances';
import { DEFAULT_TTS_VOICE_ID } from '@gruenerator/shared/settings';
import { Button, toast } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';
import { Rocket, RotateCcw, Trash2 } from 'lucide-react';
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
import { Link } from 'react-router-dom';

import { CURRENT_INSTANCE } from '../../../config/instance';
import VoicePicker from '../../voice/components/VoicePicker';
import { AccountIdentityRow, DeleteAccountSection } from '../components/AccountSection';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow from '../components/SettingsRow';
import SettingsSection from '../components/SettingsSection';
import { useSettingsDialogStore } from '../settingsDialogStore';
import { useOnboarding } from '../useOnboarding';

import useDarkMode, { type ThemePreference } from '@/components/hooks/useDarkMode';
import { QUERY_KEYS } from '@/features/auth/hooks/useProfileData';
import { profileApiService } from '@/features/auth/services/profileApiService';
import { resetAllTours } from '@/features/tours/tourState';
import { useAuthStore, type SupportedLocale } from '@/stores/authStore';

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

const LOCALE_OPTIONS: { value: SupportedLocale; label: string }[] = [
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'de-AT', label: 'Deutsch (Österreich)' },
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
  const ttsVoice = useAuthStore((s) => s.user?.tts_voice_id ?? DEFAULT_TTS_VOICE_ID);
  const updateTtsVoice = useAuthStore((s) => s.updateTtsVoice);
  const feedbackButton = useAuthStore((s) => s.user?.feedback_button ?? 'text');
  const updateFeedbackButton = useAuthStore((s) => s.updateFeedbackButton);
  const setTab = useSettingsDialogStore((s) => s.setTab);
  const { isActive: isOnboarding, restart: restartOnboarding } = useOnboarding();

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

        <SettingsRow id="allgemein.feedbackButton">
          <SegmentedControl
            aria-label="Feedback-Button"
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

      <SettingsSection title="Konto">
        <AccountIdentityRow />

        <SettingsRow id="allgemein.papierkorb">
          <Button
            asChild
            variant="outline"
            onClick={() => useSettingsDialogStore.getState().close()}
          >
            <Link to="/papierkorb">
              <Trash2 aria-hidden="true" className="mr-xs h-4 w-4" />
              Öffnen
            </Link>
          </Button>
        </SettingsRow>
      </SettingsSection>

      <DeleteAccountSection />
    </div>
  );
};

export default GeneralTab;
