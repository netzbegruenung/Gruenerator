/**
 * „Konto": Grüner Login (Ansicht), Papierkorb und Konto löschen.
 *
 * Name, Benutzername und E-Mail sind schreibgeschützte Spiegel des Grünen
 * Logins; das Löschen sitzt am Ende, getrennt von allem, was man versehentlich
 * anklickt.
 */
import { Button } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AccountIdentityRow, DeleteAccountSection } from '../components/AccountSection';
import SettingsRow from '../components/SettingsRow';
import SettingsSection from '../components/SettingsSection';
import { useSettingsDialogStore } from '../settingsDialogStore';

import { QUERY_KEYS } from '@/features/auth/hooks/useProfileData';
import { profileApiService } from '@/features/auth/services/profileApiService';
import { useAuthStore } from '@/stores/authStore';

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

const AccountTab = () => (
  <div className="flex flex-col gap-8">
    <SettingsSection title="Grüner Login">
      <AccountIdentityRow />
    </SettingsSection>

    <SettingsSection title="Inhalte">
      <SettingsRow id="allgemein.papierkorb">
        <Button asChild variant="outline" onClick={() => useSettingsDialogStore.getState().close()}>
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

export default AccountTab;
