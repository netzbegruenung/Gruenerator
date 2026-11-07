import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

// React-Native-Rezept von TanStack Query v5: „im Vordergrund“ heißt hier `AppState`
// `active`. Ohne das meldet die App nie „Fokus“ und `refetchOnWindowFocus` bliebe
// wirkungslos.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
  return () => sub.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // Bleibt aus: das Wiederverdrahten des Fokus soll nicht das Verhalten der ganzen
      // App ändern. Wer beim Zurückkehren in die App auffrischen will (die Monitor-Hooks),
      // setzt es an seiner Abfrage; ob sie wirklich lädt, entscheidet ihre `staleTime`.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
