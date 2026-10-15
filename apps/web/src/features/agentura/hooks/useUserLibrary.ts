import { useUserLibrary as useUserLibraryShared } from '@gruenerator/shared/grueneratoren';
import { toast } from '@gruenerator/ui';

/** „Zu meinen Grüneratoren" — die geteilte Bibliothek mit dem Toast des Webs. */
export function useUserLibrary() {
  return useUserLibraryShared({ onError: toast.error });
}
