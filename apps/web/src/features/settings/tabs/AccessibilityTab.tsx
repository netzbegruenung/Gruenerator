import { Switch } from '@gruenerator/ui';

import SettingsRow from '../components/SettingsRow';

import { useAuthStore } from '@/stores/authStore';

const AccessibilityTab = () => {
  const reduceMotion = useAuthStore((s) => s.user?.reduce_motion ?? false);
  const reduceTransparency = useAuthStore((s) => s.user?.reduce_transparency ?? false);
  const showSkipLink = useAuthStore((s) => s.user?.show_skip_link ?? true);
  const updateA11yPreference = useAuthStore((s) => s.updateA11yPreference);

  return (
    <div className="-my-4 divide-y divide-grey-200 dark:divide-grey-800">
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

      <SettingsRow id="barrierefreiheit.sprunglink">
        <Switch
          checked={showSkipLink}
          onCheckedChange={(checked) => void updateA11yPreference('show_skip_link', checked)}
          aria-label="Sprung-Link zum Inhalt anzeigen"
        />
      </SettingsRow>
    </div>
  );
};

export default AccessibilityTab;
