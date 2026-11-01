import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type NativeStackOptionsArgs, router, Stack } from 'expo-router';
import { Pressable } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';

/**
 * Detailseiten, Editoren und Teilen der Grüneratoren. Anders als die
 * Übersicht (`(focused)/agents`, eigene Kopfzeile mit Agentura-Knopf) tragen
 * diese Seiten den nativen Kopf wie die Werkzeuge in `(focused)/_layout.tsx`:
 * Titel und Zurück kommen vom System, Speichern sitzt rechts darin. Jede Seite
 * setzt ihren Titel selbst über `<Stack.Screen options={…} />`.
 *
 * Die erste Seite dieses Stacks bekommt einen eigenen Zurück-Knopf: der native
 * Kopf kennt nur den eigenen Stack und zeigt dort sonst keinen — die Übersicht,
 * von der man kam, liegt eine Ebene höher.
 */
export default function GrueneratorenLayout() {
  const theme = useTheme();
  return (
    <Stack
      // expo-router 58 types the navigator's `navigation` as `any` here.
      screenOptions={({
        navigation,
        route,
      }: NativeStackOptionsArgs<Record<string, object | undefined>>) => ({
        headerShown: true,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: theme.background },
        ...(navigation.getState().routes[0]?.key === route.key && {
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Zurück"
            >
              <Ionicons name="chevron-back" size={26} color={theme.text} />
            </Pressable>
          ),
        }),
      })}
    />
  );
}
