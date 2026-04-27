import React, { memo } from 'react';

import FeatureToggle from '../../../../../../components/common/FeatureToggle';
import { getEmailPreferenceTypes } from '../../../../../../features/notifications/notificationConfig';
import { useUserDefaults } from '../../../../../../hooks/useUserDefaults';
import { useAuthStore, type SupportedLocale } from '../../../../../../stores/authStore';

interface SettingsSectionProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const LocaleSelector: React.FC = () => {
  const { locale, updateLocale } = useAuthStore();

  const handleLocaleChange = async (event: React.ChangeEvent<HTMLSelectElement>): Promise<void> => {
    const newLocale = event.target.value as SupportedLocale;
    const success = await updateLocale(newLocale);
    if (!success) {
      console.error('Failed to update locale');
    }
  };

  return (
    <div className="flex flex-col gap-xxs">
      <select
        id="locale"
        value={locale}
        onChange={handleLocaleChange}
        className="rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm"
        aria-label="Sprachvariant auswählen"
      >
        <option value="de-DE">Deutsch (Deutschland)</option>
        <option value="de-AT">Deutsch (Österreich)</option>
      </select>
    </div>
  );
};

const SettingsSection: React.FC<SettingsSectionProps> = memo(
  ({ onSuccessMessage, onErrorMessage }) => {
    return (
      <NotificationToggles onSuccessMessage={onSuccessMessage} onErrorMessage={onErrorMessage} />
    );
  }
);

const NotificationToggles: React.FC<{
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}> = memo(({ onSuccessMessage, onErrorMessage }) => {
  const { get, set } = useUserDefaults<boolean>('notifications');
  const categories = getEmailPreferenceTypes();

  const handleToggle = async (key: string, label: string, checked: boolean) => {
    try {
      await set(key, checked);
      onSuccessMessage(`${label} ${checked ? 'aktiviert' : 'deaktiviert'}.`);
    } catch {
      onErrorMessage('Einstellung konnte nicht gespeichert werden.');
    }
  };

  return (
    <div>
      <div className="text-sm font-medium text-foreground mb-md">E-Mail-Benachrichtigungen</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        {categories.map((cat) => (
          <FeatureToggle
            key={cat.key}
            isActive={get(cat.key, true)}
            onToggle={(checked) => handleToggle(cat.key, cat.label, checked)}
            label={cat.label}
            icon={cat.icon}
            description={cat.description}
          />
        ))}
      </div>
    </div>
  );
});

export default SettingsSection;
export { LocaleSelector };
