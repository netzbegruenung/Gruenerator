import React from 'react';

import FeatureToggle from '../../../../../../components/common/FeatureToggle';
import { getEmailPreferenceTypes } from '../../../../../../features/notifications/notificationConfig';
import { useUserDefaults } from '../../../../../../hooks/useUserDefaults';

interface NotificationSettingsViewProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const NotificationSettingsView = React.memo(
  ({ onSuccessMessage, onErrorMessage }: NotificationSettingsViewProps) => {
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
      <div className="animate-in fade-in duration-300">
        <div className="mb-lg">
          <h2 className="text-lg font-semibold text-foreground mb-xs">E-Mail-Benachrichtigungen</h2>
          <p className="text-sm text-grey-500 dark:text-grey-400">
            Wähle aus, welche E-Mail-Benachrichtigungen du erhalten möchtest.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          {categories.map((category) => (
            <FeatureToggle
              key={category.key}
              isActive={get(category.key, true)}
              onToggle={(checked) => handleToggle(category.key, category.label, checked)}
              label={category.label}
              icon={category.icon}
              description={category.description}
            />
          ))}
        </div>
      </div>
    );
  }
);

NotificationSettingsView.displayName = 'NotificationSettingsView';

export default NotificationSettingsView;
