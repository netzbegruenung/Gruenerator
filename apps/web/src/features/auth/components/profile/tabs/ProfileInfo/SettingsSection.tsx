import { getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { Send } from 'lucide-react';
import React, { memo, useState } from 'react';

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
      <div className="space-y-lg">
        <NotificationToggles onSuccessMessage={onSuccessMessage} onErrorMessage={onErrorMessage} />
        <TestEmailRow onSuccessMessage={onSuccessMessage} onErrorMessage={onErrorMessage} />
      </div>
    );
  }
);

const TestEmailRow: React.FC<{
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}> = memo(({ onSuccessMessage, onErrorMessage }) => {
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    try {
      const client = getContractsClient();
      const result = await client.email.test({ body: {} });

      if (result.status === 200) {
        onSuccessMessage(
          result.body.recipientEmail
            ? `Test-E-Mail an ${result.body.recipientEmail} gesendet.`
            : 'Test-E-Mail gesendet.'
        );
        return;
      }

      if (result.status === 503) {
        onErrorMessage('SMTP ist auf dem Server nicht konfiguriert.');
        return;
      }

      if (
        result.status === 400 ||
        result.status === 401 ||
        result.status === 500 ||
        result.status === 502
      ) {
        onErrorMessage(result.body.error ?? 'Test-E-Mail konnte nicht gesendet werden.');
        return;
      }

      onErrorMessage('Test-E-Mail konnte nicht gesendet werden.');
    } catch {
      onErrorMessage('Netzwerkfehler.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-md p-md rounded-lg border border-grey-200 dark:border-grey-700">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">E-Mail-Zustellung testen</p>
        <p className="text-xs text-grey-500 dark:text-grey-400">
          Sendet dir sofort eine Test-E-Mail an deine Profil-Adresse, um die Zustellung zu prüfen.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={handleSend}
        disabled={isSending}
        className="shrink-0"
      >
        <Send className="w-4 h-4 mr-xs" />
        {isSending ? 'Wird gesendet…' : 'Test-E-Mail senden'}
      </Button>
    </div>
  );
});

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
