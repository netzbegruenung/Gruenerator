import { getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { RotateCcw, Send } from 'lucide-react';
import React, { memo, useState } from 'react';

import NotificationPreferences from '../../../../../../features/notifications/components/NotificationPreferences';
import { resetAllTours } from '../../../../../../features/tours/tourState';
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
        <NotificationPreferences
          onSuccessMessage={onSuccessMessage}
          onErrorMessage={onErrorMessage}
          expertExtras={
            <TestEmailRow onSuccessMessage={onSuccessMessage} onErrorMessage={onErrorMessage} />
          }
        />
        <TourResetRow onSuccessMessage={onSuccessMessage} />
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

const TourResetRow: React.FC<{ onSuccessMessage: (msg: string) => void }> = memo(
  ({ onSuccessMessage }) => (
    <div className="flex items-center justify-between gap-md p-md rounded-lg border border-grey-200 dark:border-grey-700">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Einführungs-Touren zurücksetzen</p>
        <p className="text-xs text-grey-500 dark:text-grey-400">
          Zeigt die Touren durch Workplace, Dokumente, Tabellen, Präsentationen und das
          Sharepic-Studio beim nächsten Öffnen wieder an.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          resetAllTours();
          onSuccessMessage('Touren zurückgesetzt — sie starten beim nächsten Besuch wieder.');
        }}
      >
        <RotateCcw className="w-4 h-4 mr-xs" />
        Zurücksetzen
      </Button>
    </div>
  )
);

export default SettingsSection;
export { LocaleSelector };
