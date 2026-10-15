import { Stack } from 'expo-router';

import { useTheme } from '../../../hooks/useTheme';

/**
 * Detailseiten, Editoren und Teilen der Grüneratoren. Anders als die
 * Übersicht (`(focused)/agents`, eigene Kopfzeile mit Agentura-Knopf) tragen
 * diese Seiten den nativen Kopf wie die Werkzeuge in `(focused)/_layout.tsx`:
 * Titel und Zurück kommen vom System, Speichern sitzt rechts darin. Jede Seite
 * setzt ihren Titel selbst über `<Stack.Screen options={…} />`.
 */
export default function GrueneratorenLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
