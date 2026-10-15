import { useUserLibrary as useUserLibraryShared } from '@gruenerator/shared/grueneratoren';
import { Alert } from 'react-native';

const showError = (message: string) => Alert.alert('Fehler', message);

/** „Meine Grüneratoren" — die geteilte Bibliothek mit der Fehleranzeige der App. */
export function useUserLibrary() {
  return useUserLibraryShared({ onError: showError });
}
