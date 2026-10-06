import { useAuthStore } from '@gruenerator/shared/stores';
import { Alert } from 'react-native';

import { useHiddenMembersStore } from '../../stores/hiddenMembersStore';

/** Confirms, then hides the person on this device. Safe to call from inside a modal. */
export function confirmHidePerson(userId: string, name: string | null): void {
  const ownerId = useAuthStore.getState().user?.id;
  if (!ownerId) return;
  const label = name?.trim() || 'Diese Person';
  Alert.alert(
    `${label} ausblenden?`,
    'Du siehst ihre Beiträge und Kommentare in Projekten nicht mehr. Die Person merkt davon nichts. Du kannst das in den Einstellungen rückgängig machen.',
    [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Ausblenden',
        style: 'destructive',
        onPress: () => useHiddenMembersStore.getState().hide(ownerId, userId, label),
      },
    ]
  );
}
