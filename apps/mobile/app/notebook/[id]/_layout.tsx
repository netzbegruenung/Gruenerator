import { Stack, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../../theme';

/**
 * A notebook and its chat. The chat's way back is the notebook page, whatever
 * opened it — a question on the page, a thread in the drawer, a deep link. The
 * anchor puts the page beneath the chat on a cold link and on every
 * `router.push(…, { withAnchor: true })`, so the back arrow is a plain
 * `router.back()` (#4017).
 *
 * A root route rather than a member of `(focused)`: `withAnchor` loads the
 * anchor of EVERY navigator it passes through, and `(focused)` has none of its
 * own, so React Navigation falls back to its first screen — the push slid
 * Agentura in beneath the notebook.
 *
 * The page the anchor creates on a push gets no params of its own — not even
 * the `[id]` of its own path — so it is handed the id here.
 */
export const unstable_settings = { anchor: 'index' };

export default function NotebookLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" initialParams={{ id }} />
    </Stack>
  );
}
