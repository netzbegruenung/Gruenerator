import { getContractsClient } from '@gruenerator/shared/api';
import { Button, toast } from '@gruenerator/ui';
import { Send } from 'lucide-react';
import { useState } from 'react';

import SettingsRow from '../components/SettingsRow';

import NotificationPreferences from '@/features/notifications/components/NotificationPreferences';

const TestEmailRow = () => {
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    try {
      const client = getContractsClient();
      const result = await client.email.test({ body: {} });

      if (result.status === 200) {
        toast.success(
          result.body.recipientEmail
            ? `Test-E-Mail an ${result.body.recipientEmail} gesendet.`
            : 'Test-E-Mail gesendet.'
        );
        return;
      }
      if (result.status === 503) {
        toast.error('SMTP ist auf dem Server nicht konfiguriert.');
        return;
      }
      if (
        result.status === 400 ||
        result.status === 401 ||
        result.status === 500 ||
        result.status === 502
      ) {
        toast.error(result.body.error ?? 'Test-E-Mail konnte nicht gesendet werden.');
        return;
      }
      toast.error('Test-E-Mail konnte nicht gesendet werden.');
    } catch {
      toast.error('Netzwerkfehler.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SettingsRow
      title="E-Mail-Zustellung testen"
      description="Sendet dir sofort eine Test-E-Mail an deine Profil-Adresse, um die Zustellung zu prüfen."
    >
      <Button type="button" variant="outline" onClick={handleSend} disabled={isSending}>
        <Send className="mr-xs h-4 w-4" />
        {isSending ? 'Wird gesendet…' : 'Test-E-Mail senden'}
      </Button>
    </SettingsRow>
  );
};

const NotificationsTab = () => (
  <NotificationPreferences
    onSuccessMessage={(message) => toast.success(message)}
    onErrorMessage={(message) => toast.error(message)}
    expertExtras={<TestEmailRow />}
  />
);

export default NotificationsTab;
