import { Stack } from 'expo-router';

/**
 * The home: `start` holds Chat and Arbeiten as two pages of one pager
 * (`WorkplacePager`). Everything opened from there — Wissen, Agentura, the
 * tools — is pushed onto `(focused)`, so it has a real screen to go back to.
 *
 * This used to be a `Tabs` navigator with its bar hidden, and the tools and
 * Wissen were tabs: a push there was a tab switch, with no header back on iOS
 * and a `(tools)` stack that kept the last tool open underneath the next one.
 */
export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
